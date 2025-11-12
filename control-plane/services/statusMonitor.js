const docker = require('../config/docker');
const db = require('../config/database');

class StatusMonitor {
  constructor() {
    this.interval = null;
  }

  start() {
    // Check status every 10 seconds
    this.interval = setInterval(() => this.checkAllStatuses(), 10000);
    console.log('Status monitor started');

    // Run immediately on start
    this.checkAllStatuses();
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('Status monitor stopped');
    }
  }

  async checkAllStatuses() {
    try {
      // Get all deployments with docker containers
      const result = await db.query(
        `SELECT id, docker_container_id, status
         FROM deployments
         WHERE docker_container_id IS NOT NULL
         AND status IN ('running', 'building')`
      );

      for (const deployment of result.rows) {
        await this.checkDeploymentStatus(deployment);
      }
    } catch (error) {
      console.error('Error in status monitor:', error);
    }
  }

  async checkDeploymentStatus(deployment) {
    try {
      const container = docker.getContainer(deployment.docker_container_id);
      const info = await container.inspect();

      let newStatus = deployment.status;

      if (info.State.Running) {
        newStatus = 'running';
      } else if (info.State.Status === 'exited') {
        newStatus = 'stopped';
      } else if (info.State.Status === 'dead') {
        newStatus = 'failed';
      } else if (info.State.Restarting) {
        newStatus = 'restarting';
      }

      // Update status if it changed
      if (newStatus !== deployment.status) {
        console.log(`Deployment ${deployment.id}: ${deployment.status} → ${newStatus}`);
        await db.query(
          'UPDATE deployments SET status = $1, updated_at = NOW() WHERE id = $2',
          [newStatus, deployment.id]
        );
      }
    } catch (error) {
      // Container not found or other error - mark as stopped
      if (error.statusCode === 404) {
        console.log(`Deployment ${deployment.id}: Container not found, marking as stopped`);
        await db.query(
          'UPDATE deployments SET status = $1, updated_at = NOW() WHERE id = $2',
          ['stopped', deployment.id]
        );
      } else {
        console.error(`Error checking deployment ${deployment.id}:`, error.message);
      }
    }
  }
}

module.exports = new StatusMonitor();
