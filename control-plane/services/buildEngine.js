const docker = require('../config/docker');
const db = require('../config/database');
const { ensureDockerfile } = require('../utils/dockerfileGenerator');
const tar = require('tar-stream');
const fs = require('fs-extra');
const path = require('path');

async function buildImage(deploymentId, repoPath, imageName, projectId = null) {
  try {
    const dockerfileInfo = await ensureDockerfile(repoPath);
    console.log('[Build Engine] Dockerfile info:', dockerfileInfo);

    await logBuild(deploymentId, 'Starting Docker build...');
    await updateDeploymentStatus(deploymentId, 'building');

    const tarStream = await createTarStream(repoPath);

    let buildOptions = {
      t: imageName,
      dockerfile: 'Dockerfile'
    };

    if (projectId) {
      const project = await db.query('SELECT build_cache_enabled FROM projects WHERE id = $1', [projectId]);

      if (project.rows.length > 0 && project.rows[0].build_cache_enabled) {
        const previousDeployment = await db.query(
          `SELECT docker_image_id FROM deployments
           WHERE project_id = $1 AND docker_image_id IS NOT NULL AND status = 'running'
           ORDER BY created_at DESC
           LIMIT 1`,
          [projectId]
        );

        if (previousDeployment.rows.length > 0) {
          buildOptions.cachefrom = [previousDeployment.rows[0].docker_image_id];
          await logBuild(deploymentId, `Using build cache from previous deployment`);
        }
      }
    }

    const stream = await docker.buildImage(tarStream, buildOptions);

    return new Promise((resolve, reject) => {
      let imageId = null;

      docker.modem.followProgress(stream,
        async (err, res) => {
          if (err) {
            await logBuild(deploymentId, `Build failed: ${err.message}`);
            const errorInfo = detectErrorType(err.message);
            await updateDeploymentStatus(deploymentId, 'failed', errorInfo.message, errorInfo.type);
            reject(err);
          } else {
            await logBuild(deploymentId, 'Build completed successfully');

            if (imageId) {
              await db.query(
                'UPDATE deployments SET docker_image_id = $1 WHERE id = $2',
                [imageId, deploymentId]
              );
            }

            resolve({ imageId, imageName, detectedPort: dockerfileInfo.detectedPort });
          }
        },
        async (event) => {
          if (event.stream) {
            const logLine = event.stream.trim();
            if (logLine) {
              await logBuild(deploymentId, logLine);
            }
          }

          if (event.aux?.ID) {
            imageId = event.aux.ID;
          }

          if (event.error) {
            await logBuild(deploymentId, `Error: ${event.error}`);
          }
        }
      );
    });
  } catch (error) {
    await logBuild(deploymentId, `Build error: ${error.message}`);
    const errorInfo = detectErrorType(error.message);
    await updateDeploymentStatus(deploymentId, 'failed', errorInfo.message, errorInfo.type);
    throw error;
  }
}

async function createTarStream(sourceDir) {
  return new Promise((resolve, reject) => {
    const pack = tar.pack();
    const files = getAllFiles(sourceDir);

    files.forEach(file => {
      const relativePath = path.relative(sourceDir, file);
      const content = fs.readFileSync(file);
      pack.entry({ name: relativePath }, content);
    });

    pack.finalize();
    resolve(pack);
  });
}

function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);

    if (shouldIgnore(file)) return;

    if (fs.statSync(filePath).isDirectory()) {
      getAllFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  });

  return fileList;
}

function shouldIgnore(filename) {
  const ignorePatterns = [
    'node_modules',
    '.git',
    '.env',
    '.DS_Store',
    'dist',
    'build',
    '.vscode',
    '.idea'
  ];

  return ignorePatterns.some(pattern => filename.includes(pattern));
}

async function logBuild(deploymentId, message) {
  try {
    await db.query(
      'INSERT INTO build_logs (deployment_id, log_line) VALUES ($1, $2)',
      [deploymentId, message]
    );
  } catch (error) {
    console.error('Error logging build:', error);
  }
}

async function updateDeploymentStatus(deploymentId, status, errorMessage = null, errorType = null) {
  if (errorMessage) {
    await db.query(
      'UPDATE deployments SET status = $1, error_message = $2, error_type = $3, updated_at = NOW() WHERE id = $4',
      [status, errorMessage, errorType, deploymentId]
    );
  } else {
    await db.query(
      'UPDATE deployments SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, deploymentId]
    );
  }
}

function detectErrorType(errorMessage) {
  const errorMsg = errorMessage.toLowerCase();

  if (errorMsg.includes('dockerfile') && (errorMsg.includes('not found') || errorMsg.includes('no such file'))) {
    return { type: 'MISSING_DOCKERFILE', message: 'Dockerfile not found in repository' };
  }

  if (errorMsg.includes('no space left') || errorMsg.includes('disk quota')) {
    return { type: 'DISK_SPACE', message: 'Insufficient disk space for build' };
  }

  if (errorMsg.includes('failed to solve') || errorMsg.includes('executor failed')) {
    return { type: 'BUILD_FAILED', message: 'Docker build failed. Check build logs for details.' };
  }

  if (errorMsg.includes('npm err!') || errorMsg.includes('npm install failed')) {
    return { type: 'NPM_INSTALL', message: 'NPM install failed. Check dependencies.' };
  }

  if (errorMsg.includes('yarn error') || errorMsg.includes('yarn install failed')) {
    return { type: 'YARN_INSTALL', message: 'Yarn install failed. Check dependencies.' };
  }

  if (errorMsg.includes('pip') && errorMsg.includes('error')) {
    return { type: 'PIP_INSTALL', message: 'Python pip install failed. Check requirements.' };
  }

  if (errorMsg.includes('enoent') || errorMsg.includes('no such file or directory')) {
    return { type: 'FILE_NOT_FOUND', message: 'Required file not found during build' };
  }

  if (errorMsg.includes('permission denied')) {
    return { type: 'PERMISSION_DENIED', message: 'Permission denied during build' };
  }

  if (errorMsg.includes('network') || errorMsg.includes('connection')) {
    return { type: 'NETWORK_ERROR', message: 'Network error during build' };
  }

  if (errorMsg.includes('timeout')) {
    return { type: 'TIMEOUT', message: 'Build timeout exceeded' };
  }

  return { type: 'UNKNOWN_ERROR', message: errorMessage.substring(0, 200) };
}

module.exports = {
  buildImage,
  logBuild
};
