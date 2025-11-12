const express = require('express');
const router = express.Router();
const volumeManager = require('../services/volumeManager');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const { ensureAuthenticated } = require('../middleware/auth');

router.post('/projects/:id/volumes', ensureAuthenticated, async (req, res) => {
  try {
    const { name, mountPath } = req.body;
    const projectId = parseInt(req.params.id);

    const volume = await volumeManager.createVolume(projectId, name, mountPath);

    res.json({
      success: true,
      volume
    });
  } catch (error) {
    console.error('Error creating volume:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/projects/:id/volumes', ensureAuthenticated, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);

    const volumes = await volumeManager.getProjectVolumes(projectId);

    res.json({
      success: true,
      volumes
    });
  } catch (error) {
    console.error('Error getting volumes:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.delete('/volumes/:id', ensureAuthenticated, async (req, res) => {
  try {
    const volumeId = parseInt(req.params.id);

    await volumeManager.deleteVolume(volumeId);

    res.json({
      success: true
    });
  } catch (error) {
    console.error('Error deleting volume:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/volumes/:id/files', ensureAuthenticated, async (req, res) => {
  try {
    const volumeId = parseInt(req.params.id);
    const path = req.query.path || '/';

    const files = await volumeManager.listFiles(volumeId, path);

    res.json({
      success: true,
      files
    });
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/volumes/:id/files', ensureAuthenticated, upload.single('file'), async (req, res) => {
  try {
    const volumeId = parseInt(req.params.id);
    const filePath = req.body.path;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file provided'
      });
    }

    const result = await volumeManager.uploadFile(
      volumeId,
      filePath,
      req.file.buffer,
      req.file.mimetype
    );

    res.json({
      success: true,
      file: result
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/volumes/:id/files/download', ensureAuthenticated, async (req, res) => {
  try {
    const volumeId = parseInt(req.params.id);
    const filePath = req.query.path;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'File path required'
      });
    }

    const archive = await volumeManager.downloadFile(volumeId, filePath);

    res.setHeader('Content-Type', 'application/x-tar');
    res.setHeader('Content-Disposition', `attachment; filename="${filePath}"`);

    archive.pipe(res);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.delete('/volumes/:id/files', ensureAuthenticated, async (req, res) => {
  try {
    const volumeId = parseInt(req.params.id);
    const filePath = req.query.path;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'File path required'
      });
    }

    await volumeManager.deleteFile(volumeId, filePath);

    res.json({
      success: true
    });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/volumes/:id/stats', ensureAuthenticated, async (req, res) => {
  try {
    const volumeId = parseInt(req.params.id);

    const stats = await volumeManager.getVolumeStats(volumeId);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting volume stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
