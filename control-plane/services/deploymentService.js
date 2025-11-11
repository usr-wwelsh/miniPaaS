const docker = require('../config/docker');
const db = require('../config/database');

async function startContainer(deploymentId, projectId, imageName, subdomain, envVars = {}, port = 3000) {
  try {
    const project = await db.query('SELECT * FROM projects WHERE id = $1', [projectId]);
    if (project.rows.length === 0) {
      throw new Error('Project not found');
    }

    const projectName = project.rows[0].name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const containerName = `${projectName}-${deploymentId}`;

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
        }
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

module.exports = {
  startContainer,
  stopContainer,
  getContainerLogs,
  getContainerStats
};
