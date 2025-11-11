const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { ensureAuthenticated } = require('../middleware/auth');
const logAggregator = require('../services/logAggregator');

router.get('/deployments/:id/build-logs', ensureAuthenticated, async (req, res, next) => {
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

    const logs = await logAggregator.getBuildLogs(req.params.id);
    res.json(logs);
  } catch (error) {
    next(error);
  }
});

router.get('/deployments/:id/runtime-logs', ensureAuthenticated, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 500;

    const deployment = await db.query(
      `SELECT d.* FROM deployments d
      JOIN projects p ON d.project_id = p.id
      WHERE d.id = $1 AND p.user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (deployment.rows.length === 0) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    const logs = await logAggregator.getRuntimeLogs(req.params.id, limit);
    res.json(logs);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
