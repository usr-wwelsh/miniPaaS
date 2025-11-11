function renderAnalyticsTab() {
    const tab = document.getElementById('analyticsTab');

    tab.innerHTML = `
        <div class="stats-grid" id="statsGrid">
            <div class="stat-card">
                <div class="stat-label">Total Requests</div>
                <div class="stat-value">-</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Unique Visitors</div>
                <div class="stat-value">-</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Avg Response Time</div>
                <div class="stat-value">-</div>
            </div>
        </div>

        <div class="chart-container">
            <h4 class="chart-title">Requests Over Time</h4>
            <canvas id="requestsChart"></canvas>
        </div>

        <div class="chart-container">
            <h4 class="chart-title">Resource Usage</h4>
            <canvas id="resourceChart"></canvas>
        </div>
    `;

    loadAnalytics();
}

async function loadAnalytics() {
    if (!currentProject) return;

    try {
        const analytics = await api.get(`/api/projects/${currentProject.id}/analytics?range=24h`);

        document.querySelector('.stats-grid').innerHTML = `
            <div class="stat-card">
                <div class="stat-label">Total Requests</div>
                <div class="stat-value">${analytics.summary.totalRequests}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Unique Visitors</div>
                <div class="stat-value">${analytics.summary.uniqueVisitors}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Avg Response Time</div>
                <div class="stat-value">${analytics.summary.avgResponseTime}ms</div>
            </div>
        `;

        renderRequestsChart(analytics.requestsByHour);
        renderResourceChart(analytics.resourceUsage);
    } catch (error) {
        console.error('Error loading analytics:', error);
        showNotification('Failed to load analytics', 'error');
    }
}

function renderRequestsChart(data) {
    const ctx = document.getElementById('requestsChart');
    if (!ctx) return;

    if (data.length === 0) {
        ctx.parentElement.innerHTML += '<p style="text-align: center; color: var(--text-secondary); padding: 32px;">No data available</p>';
        return;
    }

    const labels = data.map(d => {
        const date = new Date(d.hour);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });

    const chartData = data.map(d => d.count);

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Requests',
                data: chartData,
                borderColor: 'rgb(255, 107, 53)',
                backgroundColor: 'rgba(255, 107, 53, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#a0a0a0'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#a0a0a0'
                    }
                }
            }
        }
    });
}

function renderResourceChart(data) {
    const ctx = document.getElementById('resourceChart');
    if (!ctx) return;

    if (data.length === 0) {
        ctx.parentElement.innerHTML += '<p style="text-align: center; color: var(--text-secondary); padding: 32px;">No data available</p>';
        return;
    }

    const labels = data.map(d => {
        const date = new Date(d.timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'CPU %',
                    data: data.map(d => d.cpu),
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    yAxisID: 'y',
                    tension: 0.4
                },
                {
                    label: 'Memory MB',
                    data: data.map(d => d.memory),
                    borderColor: 'rgb(16, 185, 129)',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    yAxisID: 'y1',
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#a0a0a0'
                    }
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#a0a0a0'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: {
                        drawOnChartArea: false
                    },
                    ticks: {
                        color: '#a0a0a0'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#a0a0a0'
                    }
                }
            }
        }
    });
}
