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

    if (projects.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <h3>No projects yet</h3>
                <p>Create your first project to get started</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = projects.map(project => `
        <div class="project-card" onclick="openProjectDetail(${project.id})">
            <div class="project-card-header">
                <div>
                    <h3 class="project-card-title">${escapeHtml(project.name)}</h3>
                    <a href="http://${project.subdomain}.localhost" target="_blank" class="project-card-url" onclick="event.stopPropagation()">
                        ${project.subdomain}.localhost
                    </a>
                </div>
                ${getStatusBadge(project.latest_status || 'inactive')}
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
    `).join('');
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

if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
    loadProjects();
    startProjectsAutoRefresh();
}
