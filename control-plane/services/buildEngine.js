const docker = require('../config/docker');
const db = require('../config/database');
const { ensureDockerfile } = require('../utils/dockerfileGenerator');
const tar = require('tar-stream');
const fs = require('fs-extra');
const path = require('path');

async function buildImage(deploymentId, repoPath, imageName) {
  try {
    const dockerfileInfo = await ensureDockerfile(repoPath);
    console.log('[Build Engine] Dockerfile info:', dockerfileInfo);

    await logBuild(deploymentId, 'Starting Docker build...');
    await updateDeploymentStatus(deploymentId, 'building');

    const tarStream = await createTarStream(repoPath);

    const stream = await docker.buildImage(tarStream, {
      t: imageName,
      dockerfile: 'Dockerfile'
    });

    return new Promise((resolve, reject) => {
      let imageId = null;

      docker.modem.followProgress(stream,
        async (err, res) => {
          if (err) {
            await logBuild(deploymentId, `Build failed: ${err.message}`);
            await updateDeploymentStatus(deploymentId, 'failed');
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
    await updateDeploymentStatus(deploymentId, 'failed');
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

async function updateDeploymentStatus(deploymentId, status) {
  await db.query(
    'UPDATE deployments SET status = $1, updated_at = NOW() WHERE id = $2',
    [status, deploymentId]
  );
}

module.exports = {
  buildImage,
  logBuild
};
