const docker = require('../config/docker');
const db = require('../config/database');
const path = require('path');
const { promisify } = require('util');
const stream = require('stream');
const tar = require('tar-stream');

async function createVolume(projectId, name, mountPath = '/app/storage') {
  try {
    const volumeName = `minipaas-vol-${projectId}-${Date.now()}`;

    const volume = await docker.createVolume({
      Name: volumeName,
      Labels: {
        'minipaas.project.id': projectId.toString(),
        'minipaas.volume.name': name
      }
    });

    const result = await db.query(
      `INSERT INTO volumes (project_id, name, mount_path, docker_volume_name)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [projectId, name, mountPath, volumeName]
    );

    return result.rows[0];
  } catch (error) {
    console.error('Error creating volume:', error);
    throw error;
  }
}

async function deleteVolume(volumeId) {
  try {
    const volume = await db.query('SELECT * FROM volumes WHERE id = $1', [volumeId]);

    if (volume.rows.length === 0) {
      throw new Error('Volume not found');
    }

    const volumeName = volume.rows[0].docker_volume_name;

    try {
      const dockerVolume = docker.getVolume(volumeName);
      await dockerVolume.remove();
    } catch (dockerError) {
      console.warn('Docker volume already removed or not found:', dockerError.message);
    }

    await db.query('DELETE FROM volumes WHERE id = $1', [volumeId]);

    return { success: true };
  } catch (error) {
    console.error('Error deleting volume:', error);
    throw error;
  }
}

async function getVolumeStats(volumeId) {
  try {
    const volume = await db.query('SELECT * FROM volumes WHERE id = $1', [volumeId]);

    if (volume.rows.length === 0) {
      throw new Error('Volume not found');
    }

    const files = await db.query(
      'SELECT COUNT(*) as file_count, COALESCE(SUM(file_size), 0) as total_size FROM volume_files WHERE volume_id = $1',
      [volumeId]
    );

    const stats = {
      ...volume.rows[0],
      file_count: parseInt(files.rows[0].file_count),
      total_size: parseInt(files.rows[0].total_size)
    };

    await db.query(
      'UPDATE volumes SET size_bytes = $1, updated_at = NOW() WHERE id = $2',
      [stats.total_size, volumeId]
    );

    return stats;
  } catch (error) {
    console.error('Error getting volume stats:', error);
    throw error;
  }
}

async function listFiles(volumeId, dirPath = '/') {
  try {
    const volume = await db.query('SELECT * FROM volumes WHERE id = $1', [volumeId]);

    if (volume.rows.length === 0) {
      throw new Error('Volume not found');
    }

    const normalizedPath = dirPath.endsWith('/') ? dirPath : dirPath + '/';
    const files = await db.query(
      `SELECT * FROM volume_files
       WHERE volume_id = $1 AND file_path LIKE $2
       ORDER BY file_path`,
      [volumeId, normalizedPath + '%']
    );

    return files.rows.map(file => ({
      name: file.file_path.split('/').pop(),
      path: file.file_path,
      size: parseInt(file.file_size),
      mime_type: file.mime_type,
      uploaded_at: file.uploaded_at
    }));
  } catch (error) {
    console.error('Error listing files:', error);
    throw error;
  }
}

async function uploadFile(volumeId, filePath, fileBuffer, mimeType = 'application/octet-stream') {
  try {
    const volume = await db.query('SELECT * FROM volumes WHERE id = $1', [volumeId]);

    if (volume.rows.length === 0) {
      throw new Error('Volume not found');
    }

    const volumeData = volume.rows[0];
    const fileSize = fileBuffer.length;

    const currentSize = await db.query(
      'SELECT COALESCE(SUM(file_size), 0) as total FROM volume_files WHERE volume_id = $1',
      [volumeId]
    );

    if (parseInt(currentSize.rows[0].total) + fileSize > volumeData.max_size_bytes) {
      throw new Error('Volume quota exceeded');
    }

    const containerName = `minipaas-vol-upload-${Date.now()}`;

    const container = await docker.createContainer({
      Image: 'alpine:latest',
      name: containerName,
      Cmd: ['sleep', '30'],
      HostConfig: {
        Binds: [`${volumeData.docker_volume_name}:${volumeData.mount_path}`]
      }
    });

    await container.start();

    const pack = tar.pack();
    const normalizedPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
    pack.entry({ name: normalizedPath }, fileBuffer);
    pack.finalize();

    await container.putArchive(pack, { path: volumeData.mount_path });

    await container.stop();
    await container.remove();

    await db.query(
      `INSERT INTO volume_files (volume_id, file_path, file_size, mime_type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (volume_id, file_path)
       DO UPDATE SET file_size = $3, mime_type = $4, uploaded_at = NOW()`,
      [volumeId, filePath, fileSize, mimeType]
    );

    // Update the volume's size_bytes after file upload
    const stats = await getVolumeStats(volumeId);
    
    return { success: true, filePath, fileSize };
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
}

async function downloadFile(volumeId, filePath) {
  try {
    const volume = await db.query('SELECT * FROM volumes WHERE id = $1', [volumeId]);

    if (volume.rows.length === 0) {
      throw new Error('Volume not found');
    }

    const volumeData = volume.rows[0];
    const containerName = `minipaas-vol-download-${Date.now()}`;

    const container = await docker.createContainer({
      Image: 'alpine:latest',
      name: containerName,
      Cmd: ['sleep', '30'],
      HostConfig: {
        Binds: [`${volumeData.docker_volume_name}:${volumeData.mount_path}`]
      }
    });

    await container.start();

    const fullPath = path.join(volumeData.mount_path, filePath);
    const archive = await container.getArchive({ path: fullPath });

    await container.stop();
    await container.remove();

    return archive;
  } catch (error) {
    console.error('Error downloading file:', error);
    throw error;
  }
}

async function deleteFile(volumeId, filePath) {
  try {
    const volume = await db.query('SELECT * FROM volumes WHERE id = $1', [volumeId]);

    if (volume.rows.length === 0) {
      throw new Error('Volume not found');
    }

    const volumeData = volume.rows[0];
    const containerName = `minipaas-vol-delete-${Date.now()}`;

    const container = await docker.createContainer({
      Image: 'alpine:latest',
      name: containerName,
      Cmd: ['rm', '-f', path.join(volumeData.mount_path, filePath)],
      HostConfig: {
        Binds: [`${volumeData.docker_volume_name}:${volumeData.mount_path}`]
      }
    });

    await container.start();
    await container.wait();
    await container.remove();

    await db.query(
      'DELETE FROM volume_files WHERE volume_id = $1 AND file_path = $2',
      [volumeId, filePath]
    );

    // Update the volume's size_bytes after file deletion
    const stats = await getVolumeStats(volumeId);

    return { success: true };
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
}

async function getProjectVolumes(projectId) {
  try {
    const volumes = await db.query(
      'SELECT * FROM volumes WHERE project_id = $1 ORDER BY created_at DESC',
      [projectId]
    );

    return volumes.rows.map(vol => ({
      id: vol.id,
      project_id: vol.project_id,
      name: vol.name,
      mount_path: vol.mount_path,
      size_bytes: parseInt(vol.size_bytes) || 0,
      max_size_bytes: parseInt(vol.max_size_bytes) || 0,
      docker_volume_name: vol.docker_volume_name,
      created_at: vol.created_at,
      updated_at: vol.updated_at
    }));
  } catch (error) {
    console.error('Error getting project volumes:', error);
    throw error;
  }
}

module.exports = {
  createVolume,
  deleteVolume,
  getVolumeStats,
  listFiles,
  uploadFile,
  downloadFile,
  deleteFile,
  getProjectVolumes
};
