let currentEnvVars = [];

function renderEnvTab() {
    const tab = document.getElementById('envTab');

    tab.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
            <div>
                <h4>Environment Variables</h4>
                <p style="color: var(--text-secondary); margin-top: 4px;">Manage environment variables for your application</p>
            </div>
            <button class="btn btn-primary" onclick="showAddEnvModal()">Add Variable</button>
        </div>

        <div id="envVarsList">
            <div class="loading">Loading environment variables...</div>
        </div>
    `;

    loadEnvVars();
}

async function loadEnvVars() {
    if (!currentProject) return;

    try {
        const envVars = await api.get(`/api/projects/${currentProject.id}/env`);
        currentEnvVars = envVars;
        renderEnvVars(envVars);
    } catch (error) {
        console.error('Error loading environment variables:', error);
        document.getElementById('envVarsList').innerHTML = `
            <div class="empty-state">
                <p>Error loading environment variables</p>
            </div>
        `;
    }
}

function renderEnvVars(envVars) {
    const container = document.getElementById('envVarsList');

    if (envVars.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No environment variables configured</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="env-var-list">
            ${envVars.map(envVar => `
                <div class="env-var-item">
                    <div>
                        <div class="env-var-key">${escapeHtml(envVar.key)}</div>
                        <div class="env-var-value">${maskValue(envVar.value)}</div>
                    </div>
                    <div class="env-var-actions">
                        <button class="btn btn-secondary btn-icon" onclick='editEnvVar(${JSON.stringify(envVar)})' title="Edit">
                            ✏
                        </button>
                        <button class="btn btn-secondary btn-icon" onclick="deleteEnvVar('${escapeHtml(envVar.key)}')" title="Delete">
                            🗑
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function maskValue(value) {
    if (!value) return '';
    if (value.length <= 4) return '****';
    return value.substring(0, 2) + '****' + value.substring(value.length - 2);
}

function showAddEnvModal() {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'envModal';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="closeEnvModal()"></div>
        <div class="modal-content">
            <div class="modal-header">
                <h3>Add Environment Variable</h3>
                <button class="modal-close" onclick="closeEnvModal()">&times;</button>
            </div>
            <div class="modal-body">
                <form id="envForm" onsubmit="saveEnvVar(event)">
                    <div class="form-group">
                        <label>Key</label>
                        <input type="text" id="envKey" class="form-control" required placeholder="DATABASE_URL">
                    </div>

                    <div class="form-group">
                        <label>Value</label>
                        <input type="text" id="envValue" class="form-control" required placeholder="postgresql://...">
                    </div>

                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeEnvModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Add Variable</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function editEnvVar(envVar) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'envModal';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="closeEnvModal()"></div>
        <div class="modal-content">
            <div class="modal-header">
                <h3>Edit Environment Variable</h3>
                <button class="modal-close" onclick="closeEnvModal()">&times;</button>
            </div>
            <div class="modal-body">
                <form id="envForm" onsubmit="updateEnvVar(event, '${escapeHtml(envVar.key)}')">
                    <div class="form-group">
                        <label>Key</label>
                        <input type="text" id="envKey" class="form-control" value="${escapeHtml(envVar.key)}" readonly>
                    </div>

                    <div class="form-group">
                        <label>Value</label>
                        <input type="text" id="envValue" class="form-control" value="${escapeHtml(envVar.value)}" required>
                    </div>

                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeEnvModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Update Variable</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function closeEnvModal() {
    const modal = document.getElementById('envModal');
    if (modal) {
        modal.remove();
    }
}

async function saveEnvVar(event) {
    event.preventDefault();

    const key = document.getElementById('envKey').value;
    const value = document.getElementById('envValue').value;

    try {
        await api.post(`/api/projects/${currentProject.id}/env`, { key, value });
        showNotification('Environment variable added', 'success');
        closeEnvModal();
        loadEnvVars();
    } catch (error) {
        console.error('Error saving environment variable:', error);
        showNotification(error.message, 'error');
    }
}

async function updateEnvVar(event, key) {
    event.preventDefault();

    const value = document.getElementById('envValue').value;

    try {
        await api.put(`/api/projects/${currentProject.id}/env/${key}`, { value });
        showNotification('Environment variable updated', 'success');
        closeEnvModal();
        loadEnvVars();
    } catch (error) {
        console.error('Error updating environment variable:', error);
        showNotification(error.message, 'error');
    }
}

async function deleteEnvVar(key) {
    if (!confirm(`Are you sure you want to delete ${key}?`)) return;

    try {
        await api.delete(`/api/projects/${currentProject.id}/env/${key}`);
        showNotification('Environment variable deleted', 'success');
        loadEnvVars();
    } catch (error) {
        console.error('Error deleting environment variable:', error);
        showNotification(error.message, 'error');
    }
}

function renderSettingsTab() {
    const tab = document.getElementById('settingsTab');

    tab.innerHTML = `
        <div class="overview-section">
            <h4>Project Settings</h4>
            <form id="settingsForm" onsubmit="updateProjectSettings(event)">
                <div class="form-group">
                    <label>Project Name</label>
                    <input type="text" id="settingsName" class="form-control" value="${escapeHtml(currentProject.name)}" required>
                </div>

                <div class="form-group">
                    <label>Branch</label>
                    <input type="text" id="settingsBranch" class="form-control" value="${escapeHtml(currentProject.github_branch)}" required>
                </div>

                <div class="form-group">
                    <label>Port</label>
                    <input type="number" id="settingsPort" class="form-control" value="${currentProject.port}" required>
                </div>

                <div class="form-actions" style="justify-content: flex-start;">
                    <button type="submit" class="btn btn-primary">Save Changes</button>
                </div>
            </form>
        </div>

        <div class="danger-zone">
            <h4>Danger Zone</h4>
            <p>Once you delete a project, there is no going back. Please be certain.</p>
            <button class="btn btn-danger" onclick="deleteProject()">Delete Project</button>
        </div>
    `;
}

async function updateProjectSettings(event) {
    event.preventDefault();

    const data = {
        name: document.getElementById('settingsName').value,
        github_branch: document.getElementById('settingsBranch').value,
        port: parseInt(document.getElementById('settingsPort').value)
    };

    try {
        await api.put(`/api/projects/${currentProject.id}`, data);
        showNotification('Project settings updated', 'success');
        currentProject = await api.get(`/api/projects/${currentProject.id}`);
        document.getElementById('projectDetailTitle').textContent = currentProject.name;
    } catch (error) {
        console.error('Error updating project settings:', error);
        showNotification(error.message, 'error');
    }
}

async function deleteProject() {
    if (!confirm(`Are you sure you want to delete ${currentProject.name}? This action cannot be undone.`)) {
        return;
    }

    if (!confirm('This will stop all deployments and remove all data. Are you absolutely sure?')) {
        return;
    }

    try {
        await api.delete(`/api/projects/${currentProject.id}`);
        showNotification('Project deleted', 'success');
        closeProjectDetail();
        loadProjects();
    } catch (error) {
        console.error('Error deleting project:', error);
        showNotification(error.message, 'error');
    }
}
