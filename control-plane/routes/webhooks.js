const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../config/database');
const logger = require('../services/logger');
const { isAuthenticated } = require('../middleware/auth');

router.post('/projects/:id/webhook/generate', isAuthenticated, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);

    const token = crypto.randomBytes(32).toString('hex');

    await db.query(
      'UPDATE projects SET webhook_token = $1, webhook_enabled = true WHERE id = $2',
      [token, projectId]
    );

    const webhookUrl = `${req.protocol}://${req.get('host')}/api/webhooks/${projectId}/${token}`;

    res.json({
      success: true,
      webhookUrl,
      token
    });
  } catch (error) {
    logger.error('Error generating webhook token', error, { projectId: req.params.id });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/projects/:id/webhook/disable', isAuthenticated, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);

    await db.query(
      'UPDATE projects SET webhook_enabled = false WHERE id = $1',
      [projectId]
    );

    res.json({
      success: true
    });
  } catch (error) {
    logger.error('Error disabling webhook', error, { projectId: req.params.id });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/webhooks/:projectId/:token', async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const token = req.params.token;

    const project = await db.query(
      'SELECT * FROM projects WHERE id = $1 AND webhook_token = $2 AND webhook_enabled = true',
      [projectId, token]
    );

    if (project.rows.length === 0) {
      logger.warn('Invalid webhook token', { projectId, token });
      return res.status(401).json({
        success: false,
        error: 'Invalid webhook token'
      });
    }

    const signature = req.headers['x-hub-signature-256'];
    const event = req.headers['x-github-event'];

    if (event !== 'push') {
      return res.json({
        success: true,
        message: 'Event ignored'
      });
    }

    const payload = req.body;
    const branch = payload.ref ? payload.ref.replace('refs/heads/', '') : null;

    if (branch && branch !== project.rows[0].github_branch) {
      return res.json({
        success: true,
        message: 'Branch ignored'
      });
    }

    await db.query(
      'INSERT INTO webhooks (project_id, event_type, payload) VALUES ($1, $2, $3)',
      [projectId, event, payload]
    );

    logger.info('Webhook received, triggering deployment', { projectId, event, branch });

    const deployment = await db.query(
      `INSERT INTO deployments (project_id, commit_sha, status)
       VALUES ($1, $2, 'queued')
       RETURNING *`,
      [projectId, payload.after || payload.head_commit?.id]
    );

    const buildQueue = require('../services/buildQueue');
    await buildQueue.enqueueDeployment(deployment.rows[0].id, projectId);

    res.json({
      success: true,
      deploymentId: deployment.rows[0].id
    });
  } catch (error) {
    logger.error('Error processing webhook', error, { projectId: req.params.projectId });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/projects/:id/webhook/history', isAuthenticated, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);

    const webhooks = await db.query(
      'SELECT * FROM webhooks WHERE project_id = $1 ORDER BY created_at DESC LIMIT 50',
      [projectId]
    );

    res.json({
      success: true,
      webhooks: webhooks.rows
    });
  } catch (error) {
    logger.error('Error getting webhook history', error, { projectId: req.params.id });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
