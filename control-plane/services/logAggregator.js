const docker = require('../config/docker');
const db = require('../config/database');

class LogAggregator {
  constructor() {
    this.activeStreams = new Map();
  }

  async attachToContainer(deploymentId, containerId, onLog) {
    try {
      if (this.activeStreams.has(deploymentId)) {
        return;
      }

      const container = docker.getContainer(containerId);
      const stream = await container.logs({
        follow: true,
        stdout: true,
        stderr: true,
        timestamps: true
      });

      this.activeStreams.set(deploymentId, stream);

      stream.on('data', async (chunk) => {
        const logLine = chunk.toString('utf8').trim();
        if (logLine) {
          const logLevel = this.detectLogLevel(logLine);

          await db.query(
            'INSERT INTO runtime_logs (deployment_id, log_line, log_level) VALUES ($1, $2, $3)',
            [deploymentId, logLine, logLevel]
          );

          if (onLog) {
            onLog(logLine);
          }
        }
      });

      stream.on('end', () => {
        this.activeStreams.delete(deploymentId);
      });

      stream.on('error', (error) => {
        console.error(`Log stream error for deployment ${deploymentId}:`, error);
        this.activeStreams.delete(deploymentId);
      });
    } catch (error) {
      console.error('Error attaching to container logs:', error);
    }
  }

  detachFromContainer(deploymentId) {
    const stream = this.activeStreams.get(deploymentId);
    if (stream) {
      stream.destroy();
      this.activeStreams.delete(deploymentId);
    }
  }

  detectLogLevel(logLine) {
    const line = logLine.toLowerCase();

    if (line.includes('error') || line.includes('fatal') || line.includes('critical')) {
      return 'error';
    }
    if (line.includes('warn') || line.includes('warning')) {
      return 'warn';
    }
    if (line.includes('debug')) {
      return 'debug';
    }

    return 'info';
  }

  async getBuildLogs(deploymentId) {
    const result = await db.query(
      'SELECT log_line, timestamp FROM build_logs WHERE deployment_id = $1 ORDER BY timestamp ASC',
      [deploymentId]
    );
    return result.rows;
  }

  async getRuntimeLogs(deploymentId, limit = 500) {
    const result = await db.query(
      'SELECT log_line, log_level, timestamp FROM runtime_logs WHERE deployment_id = $1 ORDER BY timestamp DESC LIMIT $2',
      [deploymentId, limit]
    );
    return result.rows.reverse();
  }
}

module.exports = new LogAggregator();
