const fs = require('fs');
const path = require('path');

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
      const requirementsPath = path.join(repoPath, 'requirements.txt');
      if (fs.existsSync(requirementsPath)) {
        const requirements = fs.readFileSync(requirementsPath, 'utf8').toLowerCase();
        if (requirements.includes('flask')) {
          cmd = '["python", "-m", "flask", "run", "--host=0.0.0.0"]';
        } else if (requirements.includes('fastapi') || requirements.includes('uvicorn')) {
          cmd = '["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]';
        }
      }

      dockerfile = `FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
ENV FLASK_APP=app.py
ENV FLASK_RUN_HOST=0.0.0.0

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

  return dockerfile;
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

  const dockerfile = generateDockerfile(repoPath, projectType);
  fs.writeFileSync(dockerfilePath, dockerfile);

  return { exists: false, generated: true, projectType };
}

module.exports = {
  detectProjectType,
  generateDockerfile,
  ensureDockerfile
};
