const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { ensureAuthenticated } = require('../middleware/auth');
const { encrypt, decrypt } = require('../utils/encryption');
const githubService = require('../services/githubService');
const { detectEnvironmentVariables } = require('../services/envDetector');

router.get('/', ensureAuthenticated, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT p.*,
        (SELECT status FROM deployments WHERE project_id = p.id ORDER BY created_at DESC LIMIT 1) as latest_status,
        (SELECT COUNT(*) FROM deployments WHERE project_id = p.id) as deployment_count,
        (SELECT json_agg(d ORDER BY d.created_at DESC)
         FROM (SELECT * FROM deployments WHERE project_id = p.id ORDER BY created_at DESC LIMIT 5) d) as deployments
      FROM projects p
      WHERE p.user_id = $1
      ORDER BY p.updated_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.get('/repositories', ensureAuthenticated, async (req, res, next) => {
  try {
    const repos = await githubService.listRepositories(req.user.github_access_token);
    res.json(repos);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', ensureAuthenticated, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT p.*,
        (SELECT json_agg(d ORDER BY d.created_at DESC)
         FROM deployments d
         WHERE d.project_id = p.id) as deployments
      FROM projects p
      WHERE p.id = $1 AND p.user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.post('/', ensureAuthenticated, async (req, res, next) => {
  try {
    const { name, subdomain, github_repo_url, github_repo_name, github_branch, port } = req.body;

    if (!name || !subdomain || !github_repo_url) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const existing = await db.query(
      'SELECT id FROM projects WHERE subdomain = $1',
      [subdomain]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Subdomain already in use' });
    }

    const encryptedToken = encrypt(req.user.github_access_token);

    const result = await db.query(
      `INSERT INTO projects
        (user_id, name, subdomain, github_repo_url, github_repo_name, github_branch, github_access_token, port)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [req.user.id, name, subdomain, github_repo_url, github_repo_name, github_branch || 'main', encryptedToken, port || 3000]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', ensureAuthenticated, async (req, res, next) => {
  try {
    const { name, github_branch, port } = req.body;

    const result = await db.query(
      `UPDATE projects
      SET name = COALESCE($1, name),
          github_branch = COALESCE($2, github_branch),
          port = COALESCE($3, port),
          updated_at = NOW()
      WHERE id = $4 AND user_id = $5
      RETURNING *`,
      [name, github_branch, port, req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', ensureAuthenticated, async (req, res, next) => {
  try {
    const deployments = await db.query(
      'SELECT docker_container_id FROM deployments WHERE project_id = $1 AND docker_container_id IS NOT NULL',
      [req.params.id]
    );

    const docker = require('../config/docker');
    for (const deployment of deployments.rows) {
      try {
        const container = docker.getContainer(deployment.docker_container_id);
        await container.stop();
        await container.remove();
      } catch (error) {
        console.error('Error removing container:', error);
      }
    }

    await db.query(
      'DELETE FROM projects WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
