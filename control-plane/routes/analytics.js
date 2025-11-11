const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { ensureAuthenticated } = require('../middleware/auth');
const analyticsCollector = require('../services/analyticsCollector');

router.get('/projects/:id/analytics', ensureAuthenticated, async (req, res, next) => {
  try {
    const project = await db.query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const timeRange = req.query.range || '24h';
    const analytics = await analyticsCollector.getAnalytics(req.params.id, timeRange);

    res.json(analytics);
  } catch (error) {
    next(error);
  }
});

router.post('/event', async (req, res, next) => {
  try {
    const { projectId, type, data } = req.body;

    if (!projectId || !type || !data) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (type === 'http_request') {
      await analyticsCollector.recordHttpRequest(projectId, data);
    } else if (type === 'container_stat') {
      await analyticsCollector.recordContainerStats(projectId, data);
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
