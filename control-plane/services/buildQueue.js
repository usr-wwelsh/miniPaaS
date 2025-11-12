const db = require('../config/database');
const logger = require('./logger');
const buildEngine = require('./buildEngine');
const deploymentService = require('./deploymentService');

const MAX_CONCURRENT_BUILDS = parseInt(process.env.MAX_CONCURRENT_BUILDS || '2');
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;

let activeBuildCount = 0;
let processingQueue = false;

async function enqueueDeployment(deploymentId, projectId) {
  try {
    const queueSize = await db.query(
      "SELECT COUNT(*) as count FROM deployments WHERE status IN ('queued', 'building')"
    );

    const position = parseInt(queueSize.rows[0].count) + 1;

    await db.query(
      "UPDATE deployments SET status = 'queued', queue_position = $1 WHERE id = $2",
      [position, deploymentId]
    );

    logger.logDeployment(deploymentId, projectId, `Deployment queued at position ${position}`);

    processQueue();

    return { queued: true, position };
  } catch (error) {
    logger.error('Error enqueueing deployment', error, { deploymentId, projectId });
    throw error;
  }
}

async function processQueue() {
  if (processingQueue) {
    return;
  }

  processingQueue = true;

  try {
    while (activeBuildCount < MAX_CONCURRENT_BUILDS) {
      const nextDeployment = await db.query(
        `SELECT d.*, p.* FROM deployments d
         JOIN projects p ON d.project_id = p.id
         WHERE d.status = 'queued'
         ORDER BY d.queue_position ASC
         LIMIT 1`
      );

      if (nextDeployment.rows.length === 0) {
        break;
      }

      const deployment = nextDeployment.rows[0];

      activeBuildCount++;
      processBuild(deployment).finally(() => {
        activeBuildCount--;
        processQueue();
      });
    }
  } catch (error) {
    logger.error('Error processing build queue', error);
  } finally {
    processingQueue = false;
  }
}

async function processBuild(deployment) {
  const deploymentId = deployment.id;
  const projectId = deployment.project_id;

  try {
    await db.query(
      "UPDATE deployments SET status = 'building', queue_position = NULL WHERE id = $1",
      [deploymentId]
    );

    logger.logDeployment(deploymentId, projectId, 'Starting build');

    await buildEngine.buildAndDeploy(deploymentId, deployment);

    logger.logDeployment(deploymentId, projectId, 'Build completed successfully');
  } catch (error) {
    logger.error('Build failed', error, { deploymentId, projectId });

    const deployment_record = await db.query(
      'SELECT retry_count FROM deployments WHERE id = $1',
      [deploymentId]
    );

    const retryCount = deployment_record.rows[0]?.retry_count || 0;

    if (retryCount < RETRY_ATTEMPTS) {
      logger.logDeployment(
        deploymentId,
        projectId,
        `Retrying build (attempt ${retryCount + 1}/${RETRY_ATTEMPTS})`
      );

      setTimeout(async () => {
        await db.query(
          "UPDATE deployments SET retry_count = $1, status = 'queued' WHERE id = $2",
          [retryCount + 1, deploymentId]
        );

        processQueue();
      }, RETRY_DELAY_MS * Math.pow(2, retryCount));
    } else {
      await db.query(
        "UPDATE deployments SET status = 'failed' WHERE id = $1",
        [deploymentId]
      );
    }
  }
}

async function getQueueStatus() {
  try {
    const queued = await db.query(
      "SELECT COUNT(*) as count FROM deployments WHERE status = 'queued'"
    );

    const building = await db.query(
      "SELECT COUNT(*) as count FROM deployments WHERE status = 'building'"
    );

    return {
      queued: parseInt(queued.rows[0].count),
      building: parseInt(building.rows[0].count),
      maxConcurrent: MAX_CONCURRENT_BUILDS,
      active: activeBuildCount
    };
  } catch (error) {
    logger.error('Error getting queue status', error);
    return null;
  }
}

async function cancelDeployment(deploymentId) {
  try {
    await db.query(
      "UPDATE deployments SET status = 'cancelled' WHERE id = $1 AND status IN ('queued', 'building')",
      [deploymentId]
    );

    return { success: true };
  } catch (error) {
    logger.error('Error cancelling deployment', error, { deploymentId });
    throw error;
  }
}

async function addRetryCountColumn() {
  try {
    await db.query(
      `ALTER TABLE deployments ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0`
    );
  } catch (error) {
    console.warn('retry_count column may already exist or could not be added');
  }
}

addRetryCountColumn();

module.exports = {
  enqueueDeployment,
  processQueue,
  getQueueStatus,
  cancelDeployment
};
