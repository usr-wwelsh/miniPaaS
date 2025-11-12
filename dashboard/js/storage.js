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

let currentVolumeId = null;

async function browseVolume(volumeId) {
  currentVolumeId = volumeId;
  document.getElementById('fileBrowserModal').classList.add('active');
  document.getElementById('fileBrowserTitle').textContent = 'File Browser';
  await loadFilesInBrowser(volumeId);
}

function closeFileBrowser() {
  document.getElementById('fileBrowserModal').classList.remove('active');
  currentVolumeId = null;
}

async function loadFilesInBrowser(volumeId) {
  const container = document.getElementById('fileListContainer');
  container.innerHTML = '<p>Loading files...</p>';

  try {
    const files = await listVolumeFiles(volumeId, '/');
    renderFileList(files);
  } catch (error) {
    container.innerHTML = '<p class="error">Failed to load files</p>';
  }
}

function renderFileList(files) {
  const container = document.getElementById('fileListContainer');

  if (!files || files.length === 0) {
    container.innerHTML = '<p>No files in this volume. Upload some files to get started.</p>';
    return;
  }

  let html = '<div class="file-list">';

  files.forEach(file => {
    html += `
      <div class="file-item">
        <div class="file-info">
          <span class="file-name">${escapeHtml(file.name || file.path)}</span>
          <span class="file-size">${formatBytes(file.size || 0)}</span>
        </div>
        <button class="btn-delete" onclick="deleteFileHandler('${escapeHtml(file.path)}')">Delete</button>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

async function handleFileSelect(event) {
  const files = event.target.files;
  console.log('Files selected:', files.length);

  if (!files || files.length === 0) {
    console.log('No files selected');
    return;
  }

  if (!currentVolumeId) {
    console.error('No volume ID set');
    showNotification('Error: No volume selected', 'error');
    return;
  }

  const uploadBtn = document.querySelector('.file-upload-section .btn');
  if (uploadBtn) {
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading...';
  }

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log('Uploading file:', file.name, 'to volume:', currentVolumeId);
      await uploadFile(currentVolumeId, `/${file.name}`, file);
      console.log('File uploaded:', file.name);
    }

    await loadFilesInBrowser(currentVolumeId);
    // Refresh the main volume list to show updated size
    const volumes = await loadVolumes(currentProject.id);
    renderVolumeList(currentProject.id, volumes);
    showNotification('Files uploaded successfully', 'success');
  } catch (error) {
    console.error('Upload error:', error);
    showNotification('Failed to upload files: ' + error.message, 'error');
  } finally {
    if (uploadBtn) {
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Upload Files';
    }
    event.target.value = '';
  }
}

async function deleteFileHandler(filePath) {
  if (!currentVolumeId) return;

  try {
    await deleteFile(currentVolumeId, filePath);
    await loadFilesInBrowser(currentVolumeId);
    // Refresh the main volume list to show updated size
    const volumes = await loadVolumes(currentProject.id);
    renderVolumeList(currentProject.id, volumes);
    showNotification('File deleted', 'success');
  } catch (error) {
    showNotification('Failed to delete file: ' + error.message, 'error');
  }
}

async function renderStorageTab() {
  const tab = document.getElementById('storageTab');
  const projectId = currentProject.id;

  tab.innerHTML = `
    <div class="storage-section">
      <div class="section-header">
        <h3>Persistent Storage Volumes</h3>
        <button class="btn btn-primary" onclick="showCreateVolumeDialog(${projectId})">Create Volume</button>
      </div>
      <div id="volumesList">
        <p>Loading volumes...</p>
      </div>
    </div>
  `;

  try {
    const volumes = await loadVolumes(projectId);
    renderVolumeList(projectId, volumes);
  } catch (error) {
    document.getElementById('volumesList').innerHTML = '<p class="error">Failed to load volumes</p>';
  }
}
