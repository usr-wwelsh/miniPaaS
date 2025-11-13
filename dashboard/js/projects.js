let currentProjects = [];
let repositories = [];
let projectsRefreshInterval = null;

async function loadProjects() {
    try {
        const projects = await api.get('/api/projects');
        currentProjects = projects;
        renderProjects(projects);
    } catch (error) {
        console.error('Error loading projects:', error);
        document.getElementById('projectsGrid').innerHTML = `
            <div class="empty-state">
                <h3>Error loading projects</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

function startProjectsAutoRefresh() {
    // Clear any existing interval
    if (projectsRefreshInterval) {
        clearInterval(projectsRefreshInterval);
    }

    // Refresh every 5 seconds
    projectsRefreshInterval = setInterval(() => {
        loadProjects();
    }, 5000);
}

function stopProjectsAutoRefresh() {
    if (projectsRefreshInterval) {
        clearInterval(projectsRefreshInterval);
        projectsRefreshInterval = null;
    }
}

function renderProjects(projects) {
    const grid = document.getElementById('projectsGrid');
    const sidebar = document.getElementById('projectList');

    if (projects.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <h3>No projects yet</h3>
                <p>Create your first project to get started</p>
            </div>
        `;
        sidebar.innerHTML = '<div class="empty-state"><p>No projects</p></div>';
        return;
    }

    // Render sidebar
    sidebar.innerHTML = projects.map(project => {
        const status = project.deployments?.[0]?.status || 'idle';
        const statusClass = status === 'running' ? 'running' :
                           status === 'stopped' ? 'stopped' :
                           status === 'failed' ? 'failed' :
                           status === 'building' || status === 'pending' || status === 'queued' ? 'building' : 'idle';
        return `
            <div class="project-list-item" onclick="scrollToProject(${project.id})">
                <div class="project-status-dot ${statusClass}"></div>
                <span>${escapeHtml(project.name)}</span>
            </div>
        `;
    }).join('');

    // Render main grid
    grid.innerHTML = projects.map(project => {
        const pipeline = getPipelineStatus(project);
        return `
        <div class="project-card" id="project-${project.id}">
            <div class="project-card-header" onclick="openProjectDetail(${project.id})">
                <div>
                    <h3 class="project-card-title">${escapeHtml(project.name)}</h3>
                    <a href="http://${project.subdomain}.localhost" target="_blank" class="project-card-url" onclick="event.stopPropagation()">
                        ${project.subdomain}.localhost
                    </a>
                </div>
                <div class="project-card-meta">
                    <div class="project-card-meta-item">
                        <span>Branch: ${escapeHtml(project.github_branch)}</span>
                    </div>
                    <div class="project-card-meta-item">
                        <span>${project.deployment_count || 0} deployments</span>
                    </div>
                </div>
            </div>
            <div class="project-pipeline">
                ${renderPipelineStage('GitHub', pipeline.github)}
                ${renderPipelineStage('Build', pipeline.build)}
                ${renderPipelineStage('Docker', pipeline.docker)}
                ${renderPipelineStage('Deploy', pipeline.deploy)}
                ${renderPipelineStage('Traefik', pipeline.traefik)}
            </div>
        </div>
        `;
    }).join('');
}

function getPipelineStatus(project) {
    const latestDeployment = project.deployments?.[0];
    const status = latestDeployment?.status || 'inactive';

    console.log('Project:', project.name, 'Latest deployment:', latestDeployment, 'Status:', status);

    let pipeline = {
        github: { status: 'idle', message: 'Repository connected', action: null },
        build: { status: 'idle', message: 'Waiting', action: null },
        docker: { status: 'idle', message: 'No image', action: null },
        traefik: { status: 'idle', message: 'Not routed', action: null },
        deploy: { status: 'idle', message: 'Not deployed', action: null }
    };

    const hasNewCommit = project.latest_commit_sha &&
                        latestDeployment &&
                        latestDeployment.commit_sha &&
                        project.latest_commit_sha !== latestDeployment.commit_sha;

    if (!latestDeployment) {
        pipeline.github.status = 'warning';
        pipeline.github.message = 'No deployments yet';
        pipeline.github.action = { text: 'Deploy now?', fn: `deployProject(${project.id})` };
        return pipeline;
    }

    if (status === 'pending' || status === 'queued') {
        pipeline.github.status = 'success';
        pipeline.github.message = 'Code fetched';
        pipeline.build.status = 'pending';
        pipeline.build.message = 'Queued...';
    } else if (status === 'building') {
        pipeline.github.status = 'success';
        pipeline.github.message = 'Code fetched';
        pipeline.build.status = 'active';
        pipeline.build.message = 'Building image...';
    } else if (status === 'failed') {
        pipeline.github.status = 'success';
        pipeline.github.message = 'Code fetched';
        pipeline.build.status = 'error';
        pipeline.build.message = 'Build failed';
        const errorMsg = getErrorMessage(latestDeployment);
        if (errorMsg) {
            pipeline.build.error = errorMsg;
        }
    } else if (status === 'running') {
        pipeline.github.status = 'success';
        pipeline.github.message = 'Code synced';
        pipeline.build.status = 'success';
        pipeline.build.message = 'Built successfully';
        pipeline.docker.status = 'success';
        pipeline.docker.message = 'Image ready';
        pipeline.deploy.status = 'success';
        pipeline.deploy.message = 'Container running';

        // Check health status for Traefik
        const healthStatus = latestDeployment?.health_status;
        if (healthStatus === 'bad_gateway' || healthStatus === 'connection_refused') {
            pipeline.traefik.status = 'error';
            pipeline.traefik.message = 'Bad Gateway';
            pipeline.traefik.error = 'Port mismatch - check project settings';
        } else if (healthStatus === 'timeout' || healthStatus === 'unreachable') {
            pipeline.traefik.status = 'error';
            pipeline.traefik.message = 'Unreachable';
            pipeline.traefik.error = 'Cannot connect to container';
        } else if (healthStatus === 'error') {
            pipeline.traefik.status = 'error';
            pipeline.traefik.message = 'Server Error';
        } else if (healthStatus === 'healthy') {
            pipeline.traefik.status = 'success';
            pipeline.traefik.message = 'Routed';
        } else {
            // Unknown or checking
            pipeline.traefik.status = 'success';
            pipeline.traefik.message = 'Routed';
        }
    } else if (status === 'stopped') {
        pipeline.github.status = 'success';
        pipeline.github.message = 'Code available';
        pipeline.build.status = 'success';
        pipeline.build.message = 'Built';
        pipeline.docker.status = 'success';
        pipeline.docker.message = 'Image exists';
        pipeline.deploy.status = 'warning';
        pipeline.deploy.message = 'Stopped';
        pipeline.deploy.action = { text: 'Start?', fn: `startDeployment(${latestDeployment.id})` };
    }

    if (hasNewCommit && (status === 'running' || status === 'stopped')) {
        pipeline.github.status = 'warning';
        pipeline.github.message = 'New commit detected';
        if (project.latest_commit_message) {
            const shortMessage = project.latest_commit_message.split('\n')[0].substring(0, 50);
            pipeline.github.error = shortMessage;
        }
        pipeline.github.action = { text: 'Deploy new?', fn: `deployProject(${project.id})` };
    }

    return pipeline;
}

function renderPipelineStage(title, stage) {
    const statusClass = `status-${stage.status}`;
    const icon = getStageIcon(title, stage.status);
    const actionHtml = stage.action ?
        `<button class="pipeline-stage-action" onclick="event.stopPropagation(); ${stage.action.fn}">${stage.action.text}</button>` : '';
    const errorHtml = stage.error ?
        `<div class="pipeline-error-message">${escapeHtml(stage.error)}</div>` : '';

    return `
        <div class="pipeline-stage ${statusClass}">
            <div class="pipeline-stage-title">${title}</div>
            <div class="pipeline-stage-icon">${icon}</div>
            <div class="pipeline-stage-status">${escapeHtml(stage.message)}</div>
            ${errorHtml}
            ${actionHtml}
        </div>
    `;
}

function getStageIcon(title, status) {
    const icons = {
        'GitHub': { idle: '[  ]', success: '[OK]', error: '[X]', warning: '[!]', active: '[~]', pending: '[.]' },
        'Build': { idle: '[  ]', success: '[OK]', error: '[X]', warning: '[!]', active: '[~]', pending: '[.]' },
        'Docker': { idle: '[  ]', success: '[OK]', error: '[X]', warning: '[!]', active: '[~]', pending: '[.]' },
        'Deploy': { idle: '[  ]', success: '[OK]', error: '[X]', warning: '[!]', active: '[~]', pending: '[.]' },
        'Traefik': { idle: '[  ]', success: '[OK]', error: '[X]', warning: '[!]', active: '[~]', pending: '[.]' }
    };

    return icons[title]?.[status] || '[?]';
}

function getErrorMessage(deployment) {
    if (deployment && deployment.error_message) {
        return deployment.error_message;
    }
    return null;
}

async function deployProject(projectId) {
    try {
        showNotification('Starting deployment...', 'info');
        await api.post(`/api/projects/${projectId}/deploy`, {});
        showNotification('Deployment started successfully', 'success');
        setTimeout(() => loadProjects(), 2000);
    } catch (error) {
        console.error('Error deploying project:', error);
        showNotification(error.message, 'error');
    }
}

async function startDeployment(deploymentId) {
    try {
        showNotification('Starting container...', 'info');
        await api.post(`/api/deployments/${deploymentId}/start`, {});
        showNotification('Container started successfully', 'success');
        setTimeout(() => loadProjects(), 2000);
    } catch (error) {
        console.error('Error starting container:', error);
        showNotification(error.message, 'error');
    }
}

async function showNewProjectModal() {
    const modal = document.getElementById('newProjectModal');
    modal.classList.add('active');

    try {
        repositories = await api.get('/api/projects/repositories');
        const select = document.getElementById('repoSelect');
        select.innerHTML = `
            <option value="">Select a repository...</option>
            ${repositories.map(repo => `
                <option value="${repo.full_name}" data-url="${repo.clone_url}" data-branch="${repo.default_branch}">
                    ${repo.full_name}
                </option>
            `).join('')}
        `;
    } catch (error) {
        console.error('Error loading repositories:', error);
        showNotification('Failed to load repositories', 'error');
    }
}

function closeNewProjectModal() {
    document.getElementById('newProjectModal').classList.remove('active');
    document.getElementById('newProjectForm').reset();
}

document.getElementById('repoSelect')?.addEventListener('change', (e) => {
    const option = e.target.options[e.target.selectedIndex];
    const repoName = e.target.value.split('/')[1];

    if (repoName) {
        const subdomain = repoName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        document.getElementById('projectName').value = repoName;
        document.getElementById('subdomain').value = subdomain;
        document.getElementById('branch').value = option.dataset.branch || 'main';
    }
});

async function createProject(event) {
    event.preventDefault();

    const repoSelect = document.getElementById('repoSelect');
    const option = repoSelect.options[repoSelect.selectedIndex];

    const projectData = {
        name: document.getElementById('projectName').value,
        subdomain: document.getElementById('subdomain').value,
        github_repo_url: option.dataset.url,
        github_repo_name: repoSelect.value,
        github_branch: document.getElementById('branch').value,
        port: parseInt(document.getElementById('port').value)
    };

    try {
        await api.post('/api/projects', projectData);
        showNotification('Project created successfully', 'success');
        closeNewProjectModal();
        loadProjects();
    } catch (error) {
        console.error('Error creating project:', error);
        showNotification(error.message, 'error');
    }
}

function scrollToProject(projectId) {
    const element = document.getElementById(`project-${projectId}`);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

if (window.location.pathname === '/dashboard' || window.location.pathname === '/index.html') {
    loadProjects();
    startProjectsAutoRefresh();
}
