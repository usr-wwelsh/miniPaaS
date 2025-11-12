async function loadVolumes(projectId) {
  try {
    const response = await fetch(`/api/projects/${projectId}/volumes`, {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to load volumes');
    }

    const data = await response.json();
    return data.volumes || [];
  } catch (error) {
    console.error('Error loading volumes:', error);
    return [];
  }
}

async function createVolume(projectId, name, mountPath) {
  try {
    const response = await fetch(`/api/projects/${projectId}/volumes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ name, mountPath })
    });

    if (!response.ok) {
      throw new Error('Failed to create volume');
    }

    const data = await response.json();
    return data.volume;
  } catch (error) {
    console.error('Error creating volume:', error);
    throw error;
  }
}

async function deleteVolume(volumeId) {
  if (!confirm('Are you sure you want to delete this volume? All data will be lost.')) {
    return false;
  }

  try {
    const response = await fetch(`/api/volumes/${volumeId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to delete volume');
    }

    return true;
  } catch (error) {
    console.error('Error deleting volume:', error);
    throw error;
  }
}

async function getVolumeStats(volumeId) {
  try {
    const response = await fetch(`/api/volumes/${volumeId}/stats`, {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to get volume stats');
    }

    const data = await response.json();
    return data.stats;
  } catch (error) {
    console.error('Error getting volume stats:', error);
    return null;
  }
}

async function listVolumeFiles(volumeId, path = '/') {
  try {
    const response = await fetch(`/api/volumes/${volumeId}/files?path=${encodeURIComponent(path)}`, {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to list files');
    }

    const data = await response.json();
    return data.files || [];
  } catch (error) {
    console.error('Error listing files:', error);
    return [];
  }
}

async function uploadFile(volumeId, filePath, file) {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', filePath);

    const response = await fetch(`/api/volumes/${volumeId}/files`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });

    if (!response.ok) {
      throw new Error('Failed to upload file');
    }

    const data = await response.json();
    return data.file;
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
}

async function deleteFile(volumeId, filePath) {
  if (!confirm(`Are you sure you want to delete ${filePath}?`)) {
    return false;
  }

  try {
    const response = await fetch(`/api/volumes/${volumeId}/files?path=${encodeURIComponent(filePath)}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to delete file');
    }

    return true;
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function renderVolumeList(projectId, volumes) {
  const container = document.getElementById('volumesList');

  if (!volumes || volumes.length === 0) {
    container.innerHTML = '<p>No volumes configured. Create one to enable persistent storage.</p>';
    return;
  }

  let html = '<div class="volumes-list">';

  volumes.forEach(volume => {
    const usedPercent = volume.size_bytes > 0
      ? ((volume.size_bytes / volume.max_size_bytes) * 100).toFixed(1)
      : 0;

    html += `
      <div class="volume-item" data-volume-id="${volume.id}">
        <div class="volume-header">
          <strong>${volume.name}</strong>
          <button onclick="deleteVolumeHandler(${volume.id}, ${projectId})" class="btn-delete">Delete</button>
        </div>
        <div class="volume-info">
          <div>Mount Path: ${volume.mount_path}</div>
          <div>Size: ${formatBytes(volume.size_bytes)} / ${formatBytes(volume.max_size_bytes)} (${usedPercent}%)</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${usedPercent}%"></div>
          </div>
        </div>
        <button onclick="browseVolume(${volume.id})" class="btn-browse">Browse Files</button>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

async function deleteVolumeHandler(volumeId, projectId) {
  try {
    await deleteVolume(volumeId);
    const volumes = await loadVolumes(projectId);
    renderVolumeList(projectId, volumes);
  } catch (error) {
    alert('Failed to delete volume: ' + error.message);
  }
}

async function showCreateVolumeDialog(projectId) {
  const name = prompt('Enter volume name:');
  if (!name) return;

  const mountPath = prompt('Enter mount path:', '/app/storage');
  if (!mountPath) return;

  try {
    await createVolume(projectId, name, mountPath);
    const volumes = await loadVolumes(projectId);
    renderVolumeList(projectId, volumes);
  } catch (error) {
    alert('Failed to create volume: ' + error.message);
  }
}

async function browseVolume(volumeId) {
  alert('File browser UI is under development. Use the API endpoints directly for now.');
}
