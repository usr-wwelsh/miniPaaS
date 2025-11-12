const docker = require('../config/docker');
const db = require('../config/database');
const logger = require('./logger');
const http = require('http');

const HEALTH_CHECK_INTERVAL = 60000;
const AUTO_RESTART_FAILED = process.env.AUTO_RESTART_FAILED === 'true';

let healthCheckInterval = null;

async function checkDockerHealth() {
  try {
    await docker.ping();
    return { status: 'healthy', message: 'Docker daemon is responsive' };
  } catch (error) {
    logger.error('Docker health check failed', error);
    return { status: 'unhealthy', message: error.message };
  }
}

async function checkDatabaseHealth() {
  try {
    const result = await db.query('SELECT NOW()');
    return { status: 'healthy', message: 'Database connection is active' };
  } catch (error) {
    logger.error('Database health check failed', error);
    return { status: 'unhealthy', message: error.message };
  }
}

async function checkTraefikHealth() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'traefik',
      port: 8080,
      path: '/ping',
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      if (res.statusCode === 200) {
        resolve({ status: 'healthy', message: 'Traefik is responding' });
      } else {
        resolve({ status: 'unhealthy', message: `Traefik returned status ${res.statusCode}` });
      }
    });

    req.on('error', (error) => {
      logger.warn('Traefik health check failed', { error: error.message });
      resolve({ status: 'unhealthy', message: error.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 'unhealthy', message: 'Traefik health check timed out' });
    });

    req.end();
  });
}

async function findOrphanedContainers() {
  try {
    const containers = await docker.listContainers({ all: true });

    const minipaasContainers = containers.filter(container =>
      container.Labels && container.Labels['minipaas.deployment.id']
    );

    const orphaned = [];

    for (const container of minipaasContainers) {
      const deploymentId = container.Labels['minipaas.deployment.id'];

      const deployment = await db.query(
        'SELECT id FROM deployments WHERE id = $1',
        [deploymentId]
      );

      if (deployment.rows.length === 0) {
        orphaned.push({
          containerId: container.Id,
          containerName: container.Names[0],
          deploymentId
        });
      }
    }

    return orphaned;
  } catch (error) {
    logger.error('Error finding orphaned containers', error);
    return [];
  }
}

async function cleanupOrphanedContainers() {
  try {
    const orphaned = await findOrphanedContainers();

    for (const item of orphaned) {
      logger.info(`Cleaning up orphaned container: ${item.containerName}`);

      try {
        const container = docker.getContainer(item.containerId);
        await container.stop();
        await container.remove();
      } catch (error) {
        logger.warn(`Failed to cleanup container ${item.containerName}`, { error: error.message });
      }
    }

    return { cleaned: orphaned.length };
  } catch (error) {
    logger.error('Error cleaning up orphaned containers', error);
    return { cleaned: 0 };
  }
}

async function checkFailedDeployments() {
  try {
    const failed = await db.query(
      `SELECT d.*, p.* FROM deployments d
       JOIN projects p ON d.project_id = p.id
       WHERE d.status = 'failed' AND d.updated_at > NOW() - INTERVAL '1 hour'`
    );

    return failed.rows;
  } catch (error) {
    logger.error('Error checking failed deployments', error);
    return [];
  }
}

async function restartFailedDeployment(deploymentId) {
  try {
    logger.info(`Auto-restarting failed deployment ${deploymentId}`);

    await db.query(
      "UPDATE deployments SET status = 'queued' WHERE id = $1",
      [deploymentId]
    );

    const buildQueue = require('./buildQueue');
    buildQueue.processQueue();

    return { success: true };
  } catch (error) {
    logger.error('Error restarting failed deployment', error, { deploymentId });
    return { success: false };
  }
}

async function runHealthChecks() {
  const results = {
    timestamp: new Date().toISOString(),
    docker: await checkDockerHealth(),
    database: await checkDatabaseHealth(),
    traefik: await checkTraefikHealth()
  };

  const overallHealthy = Object.values(results).every(
    r => typeof r === 'object' && r.status === 'healthy'
  );

  results.overall = overallHealthy ? 'healthy' : 'degraded';

  if (!overallHealthy) {
    logger.warn('System health check failed', { results });
  }

  const orphaned = await findOrphanedContainers();
  if (orphaned.length > 0) {
    logger.warn(`Found ${orphaned.length} orphaned containers`);
    results.orphanedContainers = orphaned.length;
  }

  if (AUTO_RESTART_FAILED) {
    const failed = await checkFailedDeployments();
    if (failed.length > 0) {
      logger.info(`Found ${failed.length} recently failed deployments`);
    }
  }

  return results;
}

function start() {
  if (healthCheckInterval) {
    return;
  }

  logger.info('Starting health monitor');

  healthCheckInterval = setInterval(async () => {
    await runHealthChecks();
  }, HEALTH_CHECK_INTERVAL);

  runHealthChecks();
}

function stop() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
    logger.info('Health monitor stopped');
  }
}

async function getDetailedHealth() {
  const health = await runHealthChecks();
  const orphaned = await findOrphanedContainers();
  const failed = await checkFailedDeployments();

  return {
    ...health,
    orphanedContainers: orphaned,
    failedDeployments: failed.map(d => ({
      id: d.id,
      projectId: d.project_id,
      projectName: d.name,
      updatedAt: d.updated_at
    }))
  };
}

module.exports = {
  start,
  stop,
  runHealthChecks,
  getDetailedHealth,
  cleanupOrphanedContainers,
  checkDockerHealth,
  checkDatabaseHealth,
  checkTraefikHealth
};
