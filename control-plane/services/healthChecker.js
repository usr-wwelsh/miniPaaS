const db = require('../config/database');
const http = require('http');

class HealthChecker {
  constructor() {
    this.checkInterval = null;
    this.isRunning = false;
  }

  start(intervalMs = 30000) {
    if (this.isRunning) {
      console.log('[Health Checker] Already running');
      return;
    }

    console.log(`[Health Checker] Starting with ${intervalMs}ms interval`);
    this.isRunning = true;

    // Run immediately
    this.checkAllDeployments();

    // Then run periodically
    this.checkInterval = setInterval(() => {
      this.checkAllDeployments();
    }, intervalMs);
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      this.isRunning = false;
      console.log('[Health Checker] Stopped');
    }
  }

  async checkAllDeployments() {
    try {
      const deployments = await db.query(
        `SELECT d.id, d.project_id, p.subdomain, p.port
         FROM deployments d
         JOIN projects p ON d.project_id = p.id
         WHERE d.status = 'running'`
      );

      for (const deployment of deployments.rows) {
        try {
          await this.checkDeployment(deployment);
        } catch (error) {
          console.error(`[Health Checker] Error checking deployment ${deployment.id}:`, error.message);
        }
      }
    } catch (error) {
      console.error('[Health Checker] Error fetching deployments:', error);
    }
  }

  async checkDeployment(deployment) {
    // Check through Traefik from the host network
    const url = `http://traefik/`;
    const options = {
      hostname: 'traefik',
      port: 80,
      path: '/',
      method: 'GET',
      headers: {
        'Host': `${deployment.subdomain}.localhost`
      }
    };

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        req.destroy();
        this.updateHealthStatus(deployment.id, 'timeout').then(resolve);
      }, 5000);

      const req = http.request(options, (res) => {
        clearTimeout(timeout);

        let status = 'healthy';
        if (res.statusCode === 502 || res.statusCode === 503) {
          status = 'bad_gateway';
        } else if (res.statusCode === 404) {
          status = 'not_found';
        } else if (res.statusCode >= 500) {
          status = 'error';
        }

        res.on('data', () => {}); // Consume response
        res.on('end', () => {
          this.updateHealthStatus(deployment.id, status).then(resolve);
        });
      });

      req.on('error', (error) => {
        clearTimeout(timeout);
        let status = 'unreachable';

        if (error.code === 'ECONNREFUSED') {
          status = 'connection_refused';
        } else if (error.code === 'ETIMEDOUT') {
          status = 'timeout';
        }

        this.updateHealthStatus(deployment.id, status).then(resolve);
      });

      req.end();
    });
  }

  async updateHealthStatus(deploymentId, status) {
    try {
      await db.query(
        'UPDATE deployments SET health_status = $1, last_health_check = NOW() WHERE id = $2',
        [status, deploymentId]
      );
    } catch (error) {
      console.error(`[Health Checker] Error updating health status for deployment ${deploymentId}:`, error);
    }
  }
}

const healthChecker = new HealthChecker();

module.exports = healthChecker;
