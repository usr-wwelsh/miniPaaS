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

      dockerfile = `FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
${hasYarnLock ? 'COPY yarn.lock ./\n' : ''}

RUN ${hasYarnLock ? 'yarn install --frozen-lockfile' : 'npm ci --only=production'}

COPY . .

${packageJson.scripts?.build ? 'RUN ' + (hasYarnLock ? 'yarn build' : 'npm run build') + '\n' : ''}
EXPOSE 3000

CMD ["${hasYarnLock ? 'yarn' : 'npm'}", "start"]
`;
      break;

    case 'python':
      dockerfile = `FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["python", "app.py"]
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
