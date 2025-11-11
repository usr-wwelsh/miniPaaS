const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { ensureAuthenticated } = require('../middleware/auth');
const { encrypt, decrypt } = require('../utils/encryption');
const { detectEnvironmentVariables } = require('../services/envDetector');
const githubService = require('../services/githubService');
const path = require('path');

router.get('/projects/:id/env', ensureAuthenticated, async (req, res, next) => {
  try {
    const project = await db.query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const result = await db.query(
      'SELECT id, key, value, is_suggested, created_at FROM env_vars WHERE project_id = $1 ORDER BY key ASC',
      [req.params.id]
    );

    const envVars = result.rows.map(row => ({
      id: row.id,
      key: row.key,
      value: decrypt(row.value) || row.value,
      is_suggested: row.is_suggested,
      created_at: row.created_at
    }));

    res.json(envVars);
  } catch (error) {
    next(error);
  }
});

router.get('/projects/:id/env/suggest', ensureAuthenticated, async (req, res, next) => {
  try {
    const project = await db.query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const buildPath = path.join('/tmp', `suggest-${project.rows[0].id}-${Date.now()}`);

    try {
      const accessToken = decrypt(project.rows[0].github_access_token);

      await githubService.cloneRepository(
        project.rows[0].github_repo_url,
        project.rows[0].github_branch,
        buildPath,
        accessToken
      );

      const suggestions = detectEnvironmentVariables(buildPath);

      const fs = require('fs-extra');
      await fs.remove(buildPath);

      res.json(suggestions);
    } catch (error) {
      const fs = require('fs-extra');
      await fs.remove(buildPath).catch(() => {});
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

router.post('/projects/:id/env', ensureAuthenticated, async (req, res, next) => {
  try {
    const { key, value, is_suggested } = req.body;

    if (!key || value === undefined) {
      return res.status(400).json({ error: 'Key and value are required' });
    }

    const project = await db.query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const encryptedValue = encrypt(value);

    const result = await db.query(
      `INSERT INTO env_vars (project_id, key, value, is_suggested)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (project_id, key)
      DO UPDATE SET value = $3, is_suggested = $4
      RETURNING *`,
      [req.params.id, key, encryptedValue, is_suggested || false]
    );

    res.json({
      id: result.rows[0].id,
      key: result.rows[0].key,
      value: value,
      is_suggested: result.rows[0].is_suggested
    });
  } catch (error) {
    next(error);
  }
});

router.put('/projects/:id/env/:key', ensureAuthenticated, async (req, res, next) => {
  try {
    const { value } = req.body;

    if (value === undefined) {
      return res.status(400).json({ error: 'Value is required' });
    }

    const project = await db.query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const encryptedValue = encrypt(value);

    const result = await db.query(
      'UPDATE env_vars SET value = $1 WHERE project_id = $2 AND key = $3 RETURNING *',
      [encryptedValue, req.params.id, req.params.key]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Environment variable not found' });
    }

    res.json({
      id: result.rows[0].id,
      key: result.rows[0].key,
      value: value,
      is_suggested: result.rows[0].is_suggested
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/projects/:id/env/:key', ensureAuthenticated, async (req, res, next) => {
  try {
    const project = await db.query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await db.query(
      'DELETE FROM env_vars WHERE project_id = $1 AND key = $2',
      [req.params.id, req.params.key]
    );

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
