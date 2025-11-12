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
        const logLine = this.sanitizeLogLine(chunk.toString('utf8')).trim();
        if (logLine) {
          const logLevel = this.detectLogLevel(logLine);

          try {
            await db.query(
              'INSERT INTO runtime_logs (deployment_id, log_line, log_level) VALUES ($1, $2, $3)',
              [deploymentId, logLine, logLevel]
            );
          } catch (error) {
            console.error('Error inserting runtime log:', error.message);
            // Continue processing logs even if one fails
          }

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

  sanitizeLogLine(logLine) {
    // Remove null bytes and other characters that PostgreSQL can't handle
    // Also strip ANSI color codes and control characters
    return logLine
      .replace(/\x00/g, '') // Remove null bytes
      .replace(/[\x00-\x09\x0B-\x0C\x0E-\x1F\x7F]/g, '') // Remove other control chars except \n and \r
      .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, ''); // Remove ANSI escape codes
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
