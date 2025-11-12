let logWebSocket = null;
let currentDeploymentId = null;
let currentLogType = 'all'; // 'all', 'build', or 'runtime'

function renderLogsTab() {
    const tab = document.getElementById('logsTab');

    const latestDeployment = currentProject.deployments?.[0];

    tab.innerHTML = `
        <div class="log-controls">
            <div class="log-filters">
                <select id="deploymentSelector" class="form-control" style="width: 200px;" onchange="changeLogDeployment()">
                    ${(currentProject.deployments || []).map(d => `
                        <option value="${d.id}">
                            ${formatDate(d.created_at)} - ${d.status}
                        </option>
                    `).join('')}
                </select>
                <div class="log-type-tabs">
                    <button class="log-tab active" data-type="all" onclick="switchLogType('all')">All</button>
                    <button class="log-tab" data-type="build" onclick="switchLogType('build')">Build</button>
                    <button class="log-tab" data-type="runtime" onclick="switchLogType('runtime')">Runtime</button>
                </div>
            </div>
            <div class="log-search">
                <button class="btn btn-secondary btn-icon" onclick="clearLogs()" title="Clear">
                    🗑
                </button>
            </div>
        </div>

        <div class="log-status">
            <div class="log-status-indicator"></div>
            <span>Live logs</span>
        </div>

        <div class="log-viewer" id="logViewer">
            <div class="log-line log-info">Connecting to log stream...</div>
        </div>
    `;

    if (latestDeployment) {
        loadLogsForDeployment(latestDeployment.id);
    }
}

function changeLogDeployment() {
    const deploymentId = document.getElementById('deploymentSelector').value;
    loadLogsForDeployment(parseInt(deploymentId));
}

function loadLogsForDeployment(deploymentId) {
    currentDeploymentId = deploymentId;

    if (logWebSocket) {
        logWebSocket.close();
        logWebSocket = null;
    }

    const logViewer = document.getElementById('logViewer');
    if (logViewer) {
        logViewer.innerHTML = '<div class="log-line log-info">Connecting to log stream...</div>';
    }

    connectLogWebSocket(deploymentId);
}

function connectLogWebSocket(deploymentId) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/logs`;

    logWebSocket = new WebSocket(wsUrl);

    logWebSocket.onopen = () => {
        logWebSocket.send(JSON.stringify({
            type: 'subscribe',
            deploymentId: deploymentId
        }));
    };

    logWebSocket.onmessage = (event) => {
        const message = JSON.parse(event.data);

        if (message.type === 'log') {
            appendLog(message.data, message.level || 'info', message.source);
        } else if (message.type === 'subscribed') {
            const logViewer = document.getElementById('logViewer');
            if (logViewer && logViewer.children.length === 1) {
                logViewer.innerHTML = '';
            }
        }
    };

    logWebSocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        appendLog('Error connecting to log stream', 'error');
    };

    logWebSocket.onclose = () => {
        console.log('WebSocket closed');
    };
}

function appendLog(logLine, level = 'info', source = 'runtime') {
    const logViewer = document.getElementById('logViewer');
    if (!logViewer) return;

    // Filter logs based on current log type
    if (currentLogType !== 'all' && source !== currentLogType) {
        return;
    }

    const logElement = document.createElement('div');
    logElement.className = `log-line log-${level}`;
    logElement.dataset.source = source;

    const cleanedLog = logLine.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();

    // Add source badge
    const sourceBadge = source === 'build' ? '[BUILD] ' : '[RUNTIME] ';
    logElement.textContent = sourceBadge + cleanedLog;

    logViewer.appendChild(logElement);

    if (logViewer.children.length > 1000) {
        logViewer.removeChild(logViewer.firstChild);
    }

    logViewer.scrollTop = logViewer.scrollHeight;
}

function switchLogType(type) {
    currentLogType = type;

    // Update active tab styling
    document.querySelectorAll('.log-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.type === type) {
            tab.classList.add('active');
        }
    });

    // Filter existing logs
    const logViewer = document.getElementById('logViewer');
    if (!logViewer) return;

    const logLines = logViewer.querySelectorAll('.log-line');
    logLines.forEach(logLine => {
        const source = logLine.dataset.source;
        if (type === 'all' || source === type || !source) {
            logLine.style.display = '';
        } else {
            logLine.style.display = 'none';
        }
    });
}

function clearLogs() {
    const logViewer = document.getElementById('logViewer');
    if (logViewer) {
        logViewer.innerHTML = '<div class="log-line log-info">Logs cleared</div>';
    }
}

window.addEventListener('beforeunload', () => {
    if (logWebSocket) {
        logWebSocket.close();
    }
});
