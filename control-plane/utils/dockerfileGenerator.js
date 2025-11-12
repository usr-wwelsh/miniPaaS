const fs = require('fs');
const path = require('path');

/**
 * Detect Flask application entry point by checking common filenames
 * and scanning for Flask app instantiation
 */
function detectFlaskEntryPoint(repoPath) {
  console.log('[Flask Detection] Scanning repo path:', repoPath);

  // Common Flask entry point filenames in order of preference
  const commonEntryPoints = [
    'app.py',
    'main.py',
    'application.py',
    'run.py',
    'wsgi.py',
    'server.py',
    '__init__.py'
  ];

  // First, check if any of the common entry points exist
  const existingEntryPoints = commonEntryPoints.filter(filename => {
    const exists = fs.existsSync(path.join(repoPath, filename));
    if (exists) {
      console.log('[Flask Detection] Found:', filename);
    }
    return exists;
  });

  console.log('[Flask Detection] Existing entry points:', existingEntryPoints);

  if (existingEntryPoints.length === 0) {
    // No common entry points found, scan all Python files
    console.log('[Flask Detection] No common entry points, scanning all .py files');
    try {
      const files = fs.readdirSync(repoPath);
      const pythonFiles = files.filter(f => f.endsWith('.py'));
      console.log('[Flask Detection] Python files found:', pythonFiles);

      for (const file of pythonFiles) {
        const content = fs.readFileSync(path.join(repoPath, file), 'utf8');
        // Check if file contains Flask app instantiation
        if (content.includes('Flask(__name__)') || content.includes('Flask(')) {
          console.log('[Flask Detection] Found Flask app in:', file);
          return file;
        }
      }
    } catch (err) {
      console.log('[Flask Detection] Error scanning files:', err.message);
      // If scanning fails, use default
      return 'app.py';
    }
    // No Flask app found, use default
    console.log('[Flask Detection] No Flask app found, defaulting to app.py');
    return 'app.py';
  }

  // If only one common entry point exists, use it
  if (existingEntryPoints.length === 1) {
    console.log('[Flask Detection] Using single entry point:', existingEntryPoints[0]);
    return existingEntryPoints[0];
  }

  // Multiple entry points exist, scan them to find which one has Flask app
  console.log('[Flask Detection] Multiple entry points, scanning for Flask app');
  for (const file of existingEntryPoints) {
    try {
      const content = fs.readFileSync(path.join(repoPath, file), 'utf8');
      // Look for Flask app instantiation patterns
      if (
        content.includes('Flask(__name__)') ||
        content.includes('Flask(') ||
        content.includes('create_app') ||
        content.includes('app = ') ||
        content.includes('application = ')
      ) {
        console.log('[Flask Detection] Found Flask app in:', file);
        return file;
      }
    } catch (err) {
      console.log('[Flask Detection] Error reading', file, ':', err.message);
      continue;
    }
  }

  // Default to the first common entry point found
  console.log('[Flask Detection] Defaulting to first entry point:', existingEntryPoints[0]);
  return existingEntryPoints[0];
}

function detectProjectType(repoPath) {
  if (fs.existsSync(path.join(repoPath, 'Dockerfile'))) {
    return 'existing';
  }
  if (fs.existsSync(path.join(repoPath, 'package.json'))) {
    return 'nodejs';
  }
  if (fs.existsSync(path.join(repoPath, 'requirements.txt'))) {
    return 'python';
  }
  if (fs.existsSync(path.join(repoPath, 'go.mod'))) {
    return 'go';
  }
  if (fs.existsSync(path.join(repoPath, 'index.html'))) {
    return 'static';
  }
  return 'unknown';
}

function generateDockerfile(repoPath, projectType) {
  let dockerfile = '';
  let detectedPort = null; // Track the detected port

  switch (projectType) {
    case 'nodejs':
      const packageJson = JSON.parse(fs.readFileSync(path.join(repoPath, 'package.json'), 'utf8'));
      const hasYarnLock = fs.existsSync(path.join(repoPath, 'yarn.lock'));
      const hasBuildScript = packageJson.scripts?.build;

      // Check if it's a Vite/static build app
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };
      const isViteApp = allDeps?.vite || allDeps?.['@vitejs/plugin-react'] || allDeps?.['@vitejs/plugin-vue'];
      const isStaticBuildApp = isViteApp || allDeps?.['create-react-app'] || allDeps?.['next'];

      if (isViteApp && hasBuildScript) {
        // Vite app - build and serve static files
        dockerfile = `FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
${hasYarnLock ? 'COPY yarn.lock ./\n' : ''}

RUN ${hasYarnLock ? 'yarn install --frozen-lockfile' : 'npm ci'}

COPY . .

RUN ${hasYarnLock ? 'yarn build' : 'npm run build'}

# Install serve to host the static files
RUN npm install -g serve

EXPOSE 3000

# Serve the dist folder (common for Vite)
CMD ["serve", "-s", "dist", "-l", "3000"]
`;
      } else {
        // Regular Node.js app
        dockerfile = `FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
${hasYarnLock ? 'COPY yarn.lock ./\n' : ''}

RUN ${hasYarnLock ? 'yarn install --frozen-lockfile' : (hasBuildScript ? 'npm ci' : 'npm ci --only=production')}

COPY . .

${hasBuildScript ? 'RUN ' + (hasYarnLock ? 'yarn build' : 'npm run build') + '\n' : ''}
EXPOSE 3000

CMD ["${hasYarnLock ? 'yarn' : 'npm'}", "start"]
`;
      }
      break;

    case 'python':
      // Check if Flask/FastAPI exists in requirements
      let cmd = '["python", "app.py"]';
      let flaskApp = 'app.py';
      let envVars = '';
      let port = 8000; // Default Python app port

      const requirementsPath = path.join(repoPath, 'requirements.txt');
      if (fs.existsSync(requirementsPath)) {
        const requirements = fs.readFileSync(requirementsPath, 'utf8').toLowerCase();
        if (requirements.includes('flask')) {
          // Dynamically detect Flask entry point
          flaskApp = detectFlaskEntryPoint(repoPath);
          port = 5000; // Flask default port
          cmd = '["python", "-m", "flask", "run", "--host=0.0.0.0", "--port=5000"]';
          envVars = `ENV FLASK_APP=${flaskApp}
ENV FLASK_RUN_HOST=0.0.0.0
ENV FLASK_RUN_PORT=5000
`;
        } else if (requirements.includes('fastapi') || requirements.includes('uvicorn')) {
          // For FastAPI, try to detect the entry point too
          const entryPoint = detectFlaskEntryPoint(repoPath); // Reuse function for detection
          const moduleName = entryPoint.replace('.py', '');
          port = 8000; // FastAPI/Uvicorn default port
          cmd = `["uvicorn", "${moduleName}:app", "--host", "0.0.0.0", "--port", "8000"]`;
        }
      }

      detectedPort = port; // Set the detected port

      dockerfile = `FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE ${port}
${envVars}
CMD ${cmd}
`;
      break;

    case 'go':
      dockerfile = `FROM golang:1.21-alpine AS builder

WORKDIR /app

COPY go.* ./
RUN go mod download

COPY . .
RUN go build -o main .

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/main .

EXPOSE 8080

CMD ["./main"]
`;
      break;

    case 'static':
      dockerfile = `FROM nginx:alpine

COPY . /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
`;
      break;

    default:
      throw new Error('Unknown project type - cannot generate Dockerfile');
  }

  return { dockerfile, detectedPort };
}

function ensureDockerfile(repoPath) {
  const dockerfilePath = path.join(repoPath, 'Dockerfile');

  if (fs.existsSync(dockerfilePath)) {
    return { exists: true, generated: false };
  }

  const projectType = detectProjectType(repoPath);

  if (projectType === 'unknown') {
    throw new Error('Cannot detect project type');
  }

  const { dockerfile, detectedPort } = generateDockerfile(repoPath, projectType);
  fs.writeFileSync(dockerfilePath, dockerfile);

  return { exists: false, generated: true, projectType, detectedPort };
}

module.exports = {
  detectProjectType,
  generateDockerfile,
  ensureDockerfile
};
