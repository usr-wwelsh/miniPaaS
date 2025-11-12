const docker = require('../config/docker');
const db = require('../config/database');

async function startContainer(deploymentId, projectId, imageName, subdomain, envVars = {}, port = 3000) {
  try {
    const project = await db.query('SELECT * FROM projects WHERE id = $1', [projectId]);
    if (project.rows.length === 0) {
      throw new Error('Project not found');
    }

    const projectData = project.rows[0];
    const projectName = projectData.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const containerName = `${projectName}-${deploymentId}`;

    const volumes = await db.query('SELECT * FROM volumes WHERE project_id = $1', [projectId]);
    const volumeBinds = volumes.rows.map(v => `${v.docker_volume_name}:${v.mount_path}`);

    const memoryLimit = (projectData.memory_limit || 512) * 1024 * 1024;
    const cpuLimit = (projectData.cpu_limit || 1000) * 1000000;

    const containerConfig = {
      Image: imageName,
      name: containerName,
      Env: Object.entries(envVars).map(([key, value]) => `${key}=${value}`),
      Labels: {
        'traefik.enable': 'true',
        [`traefik.http.routers.${projectName}.rule`]: `Host(\`${subdomain}.localhost\`)`,
        [`traefik.http.routers.${projectName}.entrypoints`]: 'web',
        [`traefik.http.services.${projectName}.loadbalancer.server.port`]: port.toString(),
        'minipaas.project.id': projectId.toString(),
        'minipaas.deployment.id': deploymentId.toString()
      },
      HostConfig: {
        NetworkMode: '1minipaas_paas_network',
        RestartPolicy: {
          Name: 'unless-stopped'
        },
        Memory: memoryLimit,
        NanoCpus: cpuLimit,
        Binds: volumeBinds
      },
      ExposedPorts: {
        [`${port}/tcp`]: {}
      }
    };

    const container = await docker.createContainer(containerConfig);
    await container.start();

    const containerInfo = await container.inspect();
    const containerId = containerInfo.Id;

    await db.query(
      'UPDATE deployments SET docker_container_id = $1, status = $2, started_at = NOW(), completed_at = NOW() WHERE id = $3',
      [containerId, 'running', deploymentId]
    );

    return {
      containerId,
      containerName,
      status: 'running'
    };
  } catch (error) {
    console.error('Error starting container:', error);
    await db.query(
      'UPDATE deployments SET status = $1 WHERE id = $2',
      ['failed', deploymentId]
    );
    throw error;
  }
}

async function stopContainer(deploymentId) {
  try {
    const deployment = await db.query(
      'SELECT docker_container_id FROM deployments WHERE id = $1',
      [deploymentId]
    );

    if (deployment.rows.length === 0 || !deployment.rows[0].docker_container_id) {
      throw new Error('Container not found');
    }

    const containerId = deployment.rows[0].docker_container_id;
    const container = docker.getContainer(containerId);

    await container.stop();
    await container.remove();

    await db.query(
      'UPDATE deployments SET status = $1 WHERE id = $2',
      ['stopped', deploymentId]
    );

    return { success: true };
  } catch (error) {
    console.error('Error stopping container:', error);
    throw error;
  }
}

async function getContainerLogs(containerId, tail = 100) {
  try {
    const container = docker.getContainer(containerId);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail: tail,
      timestamps: true
    });

    return logs.toString('utf8');
  } catch (error) {
    console.error('Error getting container logs:', error);
    throw error;
  }
}

async function getContainerStats(containerId) {
  try {
    const container = docker.getContainer(containerId);
    const stats = await container.stats({ stream: false });

    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuPercent = (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100;

    const memoryUsage = stats.memory_stats.usage / (1024 * 1024);
    const memoryLimit = stats.memory_stats.limit / (1024 * 1024);

    return {
      cpuPercent: cpuPercent.toFixed(2),
      memoryMB: memoryUsage.toFixed(2),
      memoryLimitMB: memoryLimit.toFixed(2),
      memoryPercent: ((memoryUsage / memoryLimit) * 100).toFixed(2)
    };
  } catch (error) {
    console.error('Error getting container stats:', error);
    return null;
  }
}

async function rollbackDeployment(projectId, targetDeploymentId) {
  try {
    const targetDeployment = await db.query(
      'SELECT * FROM deployments WHERE id = $1 AND project_id = $2',
      [targetDeploymentId, projectId]
    );

    if (targetDeployment.rows.length === 0) {
      throw new Error('Target deployment not found');
    }

    const deployment = targetDeployment.rows[0];

    if (!deployment.docker_image_id || !deployment.can_rollback) {
      throw new Error('Cannot rollback to this deployment');
    }

    const currentDeployment = await db.query(
      "SELECT * FROM deployments WHERE project_id = $1 AND status = 'running' ORDER BY created_at DESC LIMIT 1",
      [projectId]
    );

    if (currentDeployment.rows.length > 0) {
      await stopContainer(currentDeployment.rows[0].id);
    }

    const newDeployment = await db.query(
      `INSERT INTO deployments (project_id, commit_sha, status, docker_image_id)
       VALUES ($1, $2, 'pending', $3)
       RETURNING *`,
      [projectId, deployment.commit_sha, deployment.docker_image_id]
    );

    return newDeployment.rows[0];
  } catch (error) {
    console.error('Error rolling back deployment:', error);
    throw error;
  }
}

async function cleanupOldImages(projectId) {
  try {
    const project = await db.query('SELECT keep_image_history FROM projects WHERE id = $1', [projectId]);

    if (project.rows.length === 0) {
      return;
    }

    const keepCount = project.rows[0].keep_image_history || 5;

    const oldDeployments = await db.query(
      `SELECT docker_image_id FROM deployments
       WHERE project_id = $1 AND docker_image_id IS NOT NULL
       ORDER BY created_at DESC
       OFFSET $2`,
      [projectId, keepCount]
    );

    for (const deployment of oldDeployments.rows) {
      try {
        const image = docker.getImage(deployment.docker_image_id);
        await image.remove({ force: false });
      } catch (error) {
        console.warn('Could not remove old image:', error.message);
      }
    }
  } catch (error) {
    console.error('Error cleaning up old images:', error);
  }
}

module.exports = {
  startContainer,
  stopContainer,
  getContainerLogs,
  getContainerStats,
  rollbackDeployment,
  cleanupOldImages
};
