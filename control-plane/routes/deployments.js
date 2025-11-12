const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { ensureAuthenticated } = require('../middleware/auth');
const { decrypt } = require('../utils/encryption');
const githubService = require('../services/githubService');
const buildEngine = require('../services/buildEngine');
const deploymentService = require('../services/deploymentService');
const fs = require('fs-extra');
const path = require('path');

router.post('/projects/:projectId/deploy', ensureAuthenticated, async (req, res, next) => {
  try {
    const projectResult = await db.query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [req.params.projectId, req.user.id]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = projectResult.rows[0];
    const accessToken = decrypt(project.github_access_token);

    const deploymentResult = await db.query(
      'INSERT INTO deployments (project_id, status) VALUES ($1, $2) RETURNING *',
      [project.id, 'pending']
    );

    const deployment = deploymentResult.rows[0];

    res.json({
      success: true,
      deploymentId: deployment.id,
      message: 'Deployment started'
    });

    const buildPath = path.join('/tmp/builds', `project-${project.id}-${deployment.id}`);

    try {
      const cloneResult = await githubService.cloneRepository(
        project.github_repo_url,
        project.github_branch,
        buildPath,
        accessToken
      );

      await db.query(
        'UPDATE deployments SET commit_sha = $1 WHERE id = $2',
        [cloneResult.commitSha, deployment.id]
      );

      const imageName = `minipaas-${project.subdomain}:${deployment.id}`;

      const buildResult = await buildEngine.buildImage(deployment.id, buildPath, imageName);

      // Update project port if a port was detected during build
      let projectPort = project.port;
      if (buildResult.detectedPort) {
        console.log(`[Deployment] Detected port ${buildResult.detectedPort} for project ${project.id}`);
        await db.query(
          'UPDATE projects SET port = $1 WHERE id = $2',
          [buildResult.detectedPort, project.id]
        );
        projectPort = buildResult.detectedPort;
      }

      const envVars = await db.query(
        'SELECT key, value FROM env_vars WHERE project_id = $1',
        [project.id]
      );

      const envObject = {};
      envVars.rows.forEach(row => {
        envObject[row.key] = decrypt(row.value) || row.value;
      });

      const stopPrevious = await db.query(
        'SELECT id FROM deployments WHERE project_id = $1 AND status = $2 AND id != $3',
        [project.id, 'running', deployment.id]
      );

      for (const prevDep of stopPrevious.rows) {
        try {
          await deploymentService.stopContainer(prevDep.id);
        } catch (error) {
          console.error('Error stopping previous deployment:', error);
        }
      }

      await deploymentService.startContainer(
        deployment.id,
        project.id,
        imageName,
        project.subdomain,
        envObject,
        projectPort
      );

      await fs.remove(buildPath);

    } catch (error) {
      console.error('Deployment error:', error);
      await buildEngine.logBuild(deployment.id, `Deployment failed: ${error.message}`);
      await db.query(
        'UPDATE deployments SET status = $1 WHERE id = $2',
        ['failed', deployment.id]
      );

      try {
        await fs.remove(buildPath);
      } catch (cleanupError) {
        console.error('Error cleaning up build directory:', cleanupError);
      }
    }

  } catch (error) {
    next(error);
  }
});

router.get('/:id', ensureAuthenticated, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT d.*, p.name as project_name, p.subdomain
      FROM deployments d
      JOIN projects p ON d.project_id = p.id
      WHERE d.id = $1 AND p.user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/stop', ensureAuthenticated, async (req, res, next) => {
  try {
    const deployment = await db.query(
      `SELECT d.* FROM deployments d
      JOIN projects p ON d.project_id = p.id
      WHERE d.id = $1 AND p.user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (deployment.rows.length === 0) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    await deploymentService.stopContainer(req.params.id);

    res.json({ success: true, message: 'Deployment stopped' });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', ensureAuthenticated, async (req, res, next) => {
  try {
    const deployment = await db.query(
      `SELECT d.* FROM deployments d
      JOIN projects p ON d.project_id = p.id
      WHERE d.id = $1 AND p.user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (deployment.rows.length === 0) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    if (deployment.rows[0].status === 'running') {
      await deploymentService.stopContainer(req.params.id);
    }

    await db.query('DELETE FROM deployments WHERE id = $1', [req.params.id]);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
