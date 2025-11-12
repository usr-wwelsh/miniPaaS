let currentProject = null;
let projectDetailRefreshInterval = null;

async function openProjectDetail(projectId) {
    try {
        currentProject = await api.get(`/api/projects/${projectId}`);
        document.getElementById('projectDetailTitle').textContent = currentProject.name;
        document.getElementById('projectDetailModal').classList.add('active');

        switchTab('overview');
        renderOverviewTab();

        // Start auto-refresh for project details
        startProjectDetailAutoRefresh();
    } catch (error) {
        console.error('Error loading project:', error);
        showNotification('Failed to load project details', 'error');
    }
}

function closeProjectDetail() {
    document.getElementById('projectDetailModal').classList.remove('active');
    stopProjectDetailAutoRefresh();
    currentProject = null;
}

async function refreshProjectDetail() {
    if (!currentProject) return;

    try {
        const updated = await api.get(`/api/projects/${currentProject.id}`);
        currentProject = updated;

        // Re-render the current tab
        const activeTab = document.querySelector('.tab-button.active');
        if (activeTab) {
            const tabName = activeTab.textContent.toLowerCase();
            switchTab(tabName);
        }
    } catch (error) {
        console.error('Error refreshing project:', error);
    }
}

function startProjectDetailAutoRefresh() {
    if (projectDetailRefreshInterval) {
        clearInterval(projectDetailRefreshInterval);
    }

    // Refresh every 3 seconds
    projectDetailRefreshInterval = setInterval(() => {
        refreshProjectDetail();
    }, 3000);
}

function stopProjectDetailAutoRefresh() {
    if (projectDetailRefreshInterval) {
        clearInterval(projectDetailRefreshInterval);
        projectDetailRefreshInterval = null;
    }
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    event?.target.classList.add('active');
    document.getElementById(`${tabName}Tab`).classList.add('active');

    if (tabName === 'overview') {
        renderOverviewTab();
    } else if (tabName === 'logs') {
        renderLogsTab();
    } else if (tabName === 'analytics') {
        renderAnalyticsTab();
    } else if (tabName === 'env') {
        renderEnvTab();
    } else if (tabName === 'settings') {
        renderSettingsTab();
    }
}

function renderOverviewTab() {
    const latestDeployment = currentProject.deployments?.[0];
    const tab = document.getElementById('overviewTab');

    tab.innerHTML = `
        <div class="overview-section">
            <div class="overview-grid">
                <div class="overview-item">
                    <div class="overview-label">Status</div>
                    <div class="overview-value">${getStatusBadge(latestDeployment?.status || 'inactive')}</div>
                </div>
                <div class="overview-item">
                    <div class="overview-label">URL</div>
                    <div class="overview-value">
                        <a href="http://${currentProject.subdomain}.localhost" target="_blank" style="color: var(--accent-primary)">
                            ${currentProject.subdomain}.localhost
                        </a>
                    </div>
                </div>
                <div class="overview-item">
                    <div class="overview-label">Repository</div>
                    <div class="overview-value">${escapeHtml(currentProject.github_repo_name)}</div>
                </div>
                <div class="overview-item">
                    <div class="overview-label">Branch</div>
                    <div class="overview-value">${escapeHtml(currentProject.github_branch)}</div>
                </div>
            </div>
        </div>

        <div class="overview-section">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h4>Deployments</h4>
                <button class="btn btn-primary" onclick="deployProject()">Deploy Now</button>
            </div>

            <div class="deployment-history">
                ${renderDeployments(currentProject.deployments || [])}
            </div>
        </div>
    `;
}

function renderDeployments(deployments) {
    if (deployments.length === 0) {
        return '<div class="empty-state"><p>No deployments yet</p></div>';
    }

    return deployments.map(deployment => `
        <div class="deployment-item">
            <div class="deployment-info">
                <div>
                    ${getStatusBadge(deployment.status)}
                    <span style="margin-left: 12px; color: var(--text-secondary)">
                        ${formatDate(deployment.created_at)}
                    </span>
                </div>
                <div class="deployment-commit">
                    Commit: ${truncateCommit(deployment.commit_sha)}
                </div>
            </div>
            <div class="deployment-actions">
                ${deployment.status === 'running' ? `
                    <button class="btn btn-secondary btn-icon" onclick="stopDeployment(${deployment.id})" title="Stop">
                        ⏹
                    </button>
                ` : ''}
                <button class="btn btn-secondary btn-icon" onclick="viewDeploymentLogs(${deployment.id})" title="View Logs">
                    📄
                </button>
            </div>
        </div>
    `).join('');
}

async function deployProject() {
    if (!currentProject) return;

    try {
        showNotification('Starting deployment...', 'info');
        await api.post(`/api/projects/${currentProject.id}/deploy`, {});
        showNotification('Deployment started successfully', 'success');

        setTimeout(async () => {
            currentProject = await api.get(`/api/projects/${currentProject.id}`);
            renderOverviewTab();
        }, 2000);
    } catch (error) {
        console.error('Error deploying project:', error);
        showNotification(error.message, 'error');
    }
}

async function stopDeployment(deploymentId) {
    if (!confirm('Are you sure you want to stop this deployment?')) return;

    try {
        await api.post(`/api/deployments/${deploymentId}/stop`, {});
        showNotification('Deployment stopped', 'success');

        currentProject = await api.get(`/api/projects/${currentProject.id}`);
        renderOverviewTab();
    } catch (error) {
        console.error('Error stopping deployment:', error);
        showNotification(error.message, 'error');
    }
}

function viewDeploymentLogs(deploymentId) {
    switchTab('logs');
    loadLogsForDeployment(deploymentId);
}
