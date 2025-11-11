const fs = require('fs');
const path = require('path');

function detectEnvironmentVariables(repoPath) {
  const suggestions = [];

  try {
    if (fs.existsSync(path.join(repoPath, '.env.example'))) {
      const envExample = fs.readFileSync(path.join(repoPath, '.env.example'), 'utf-8');
      const parsed = parseEnvFile(envExample);
      suggestions.push(...parsed.map(item => ({
        ...item,
        reason: 'Found in .env.example'
      })));
    }

    if (fs.existsSync(path.join(repoPath, 'package.json'))) {
      const packageJson = JSON.parse(fs.readFileSync(path.join(repoPath, 'package.json'), 'utf-8'));

      if (packageJson.dependencies?.express || packageJson.dependencies?.koa) {
        suggestions.push({
          key: 'PORT',
          value: '3000',
          reason: 'Node.js web server detected'
        });
        suggestions.push({
          key: 'NODE_ENV',
          value: 'production',
          reason: 'Node.js application'
        });
      }

      if (packageJson.dependencies?.mongoose) {
        suggestions.push({
          key: 'MONGODB_URI',
          value: 'mongodb://localhost:27017/dbname',
          reason: 'Mongoose (MongoDB) detected'
        });
      }

      if (packageJson.dependencies?.pg) {
        suggestions.push({
          key: 'DATABASE_URL',
          value: 'postgresql://user:pass@localhost:5432/dbname',
          reason: 'PostgreSQL (pg) detected'
        });
      }

      if (packageJson.dependencies?.mysql || packageJson.dependencies?.mysql2) {
        suggestions.push({
          key: 'DATABASE_URL',
          value: 'mysql://user:pass@localhost:3306/dbname',
          reason: 'MySQL detected'
        });
      }

      if (packageJson.dependencies?.redis) {
        suggestions.push({
          key: 'REDIS_URL',
          value: 'redis://localhost:6379',
          reason: 'Redis detected'
        });
      }
    }

    if (fs.existsSync(path.join(repoPath, 'requirements.txt'))) {
      const requirements = fs.readFileSync(path.join(repoPath, 'requirements.txt'), 'utf-8');

      if (requirements.includes('django')) {
        suggestions.push({
          key: 'SECRET_KEY',
          value: '',
          reason: 'Django application'
        });
        suggestions.push({
          key: 'DEBUG',
          value: 'False',
          reason: 'Django application'
        });
        suggestions.push({
          key: 'ALLOWED_HOSTS',
          value: 'localhost',
          reason: 'Django application'
        });
      }

      if (requirements.includes('flask')) {
        suggestions.push({
          key: 'FLASK_ENV',
          value: 'production',
          reason: 'Flask application'
        });
        suggestions.push({
          key: 'SECRET_KEY',
          value: '',
          reason: 'Flask application'
        });
      }
    }

    const uniqueSuggestions = suggestions.reduce((acc, current) => {
      const exists = acc.find(item => item.key === current.key);
      if (!exists) {
        acc.push(current);
      }
      return acc;
    }, []);

    return uniqueSuggestions;
  } catch (error) {
    console.error('Error detecting environment variables:', error);
    return [];
  }
}

function parseEnvFile(content) {
  const lines = content.split('\n');
  const vars = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    const [key, ...valueParts] = trimmed.split('=');
    if (key) {
      vars.push({
        key: key.trim(),
        value: valueParts.join('=').trim() || '',
        is_suggested: true
      });
    }
  }

  return vars;
}

module.exports = {
  detectEnvironmentVariables,
  parseEnvFile
};
