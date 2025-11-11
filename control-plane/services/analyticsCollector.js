const db = require('../config/database');
const docker = require('../config/docker');
const fs = require('fs');
const { Tail } = require('tail');

class AnalyticsCollector {
  constructor() {
    this.statsInterval = null;
  }

  async recordHttpRequest(projectId, requestData) {
    try {
      await db.query(
        'INSERT INTO analytics_events (project_id, event_type, data) VALUES ($1, $2, $3)',
        [projectId, 'http_request', JSON.stringify(requestData)]
      );
    } catch (error) {
      console.error('Error recording HTTP request:', error);
    }
  }

  async recordContainerStats(projectId, statsData) {
    try {
      await db.query(
        'INSERT INTO analytics_events (project_id, event_type, data) VALUES ($1, $2, $3)',
        [projectId, 'container_stat', JSON.stringify(statsData)]
      );
    } catch (error) {
      console.error('Error recording container stats:', error);
    }
  }

  startStatsCollection() {
    if (this.statsInterval) return;

    this.statsInterval = setInterval(async () => {
      try {
        const containers = await docker.listContainers({ all: false });

        for (const containerInfo of containers) {
          const projectId = containerInfo.Labels?.['minipaas.project.id'];
          if (!projectId) continue;

          const container = docker.getContainer(containerInfo.Id);
          const stats = await container.stats({ stream: false });

          const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
          const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
          const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100 : 0;

          const memoryMB = stats.memory_stats.usage / (1024 * 1024);

          await this.recordContainerStats(projectId, {
            cpu_percent: parseFloat(cpuPercent.toFixed(2)),
            memory_mb: parseFloat(memoryMB.toFixed(2))
          });
        }
      } catch (error) {
        console.error('Error collecting container stats:', error);
      }
    }, 30000);
  }

  stopStatsCollection() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }

  async getAnalytics(projectId, timeRange = '24h') {
    const timeRangeMap = {
      '1h': '1 hour',
      '24h': '24 hours',
      '7d': '7 days',
      '30d': '30 days'
    };

    const interval = timeRangeMap[timeRange] || '24 hours';

    const requestStats = await db.query(
      `SELECT
        COUNT(*) as total_requests,
        COUNT(DISTINCT data->>'ip') as unique_visitors,
        AVG((data->>'duration_ms')::float) as avg_response_time
      FROM analytics_events
      WHERE project_id = $1
        AND event_type = 'http_request'
        AND timestamp > NOW() - INTERVAL '${interval}'`,
      [projectId]
    );

    const statusCodes = await db.query(
      `SELECT
        CASE
          WHEN (data->>'status')::int < 300 THEN '2xx'
          WHEN (data->>'status')::int < 400 THEN '3xx'
          WHEN (data->>'status')::int < 500 THEN '4xx'
          ELSE '5xx'
        END as status_group,
        COUNT(*) as count
      FROM analytics_events
      WHERE project_id = $1
        AND event_type = 'http_request'
        AND timestamp > NOW() - INTERVAL '${interval}'
      GROUP BY status_group`,
      [projectId]
    );

    const requestsByHour = await db.query(
      `SELECT
        DATE_TRUNC('hour', timestamp) as hour,
        COUNT(*) as count
      FROM analytics_events
      WHERE project_id = $1
        AND event_type = 'http_request'
        AND timestamp > NOW() - INTERVAL '${interval}'
      GROUP BY hour
      ORDER BY hour ASC`,
      [projectId]
    );

    const resourceUsage = await db.query(
      `SELECT
        timestamp,
        (data->>'cpu_percent')::float as cpu,
        (data->>'memory_mb')::float as memory
      FROM analytics_events
      WHERE project_id = $1
        AND event_type = 'container_stat'
        AND timestamp > NOW() - INTERVAL '${interval}'
      ORDER BY timestamp ASC`,
      [projectId]
    );

    return {
      summary: {
        totalRequests: parseInt(requestStats.rows[0]?.total_requests || 0),
        uniqueVisitors: parseInt(requestStats.rows[0]?.unique_visitors || 0),
        avgResponseTime: parseFloat(requestStats.rows[0]?.avg_response_time || 0).toFixed(2)
      },
      statusCodes: statusCodes.rows,
      requestsByHour: requestsByHour.rows,
      resourceUsage: resourceUsage.rows
    };
  }
}

module.exports = new AnalyticsCollector();
