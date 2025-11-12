const fs = require('fs');
const path = require('path');

const defaultConfig = {
  defaultPort: 3000,
  maxConcurrentBuilds: 2,
  volumeDefaultSize: 5 * 1024 * 1024 * 1024,
  buildCacheEnabled: true,
  resourceLimits: {
    defaultMemoryMB: 512,
    defaultCPUMillicores: 1000
  },
  retention: {
    keepDeployments: 10,
    keepImages: 5,
    logRetentionDays: 30
  },
  healthCheck: {
    intervalSeconds: 60,
    autoRestartFailed: false
  },
  webhooks: {
    enabled: true,
    allowedEvents: ['push']
  }
};

let config = { ...defaultConfig };

const configPaths = [
  path.join(process.cwd(), 'minipaas.config.js'),
  path.join(process.cwd(), '..', 'minipaas.config.js'),
  path.join(__dirname, '..', '..', 'minipaas.config.js')
];

for (const configPath of configPaths) {
  if (fs.existsSync(configPath)) {
    try {
      const userConfig = require(configPath);
      config = { ...config, ...userConfig };
      console.log(`Loaded configuration from ${configPath}`);
      break;
    } catch (error) {
      console.warn(`Failed to load config from ${configPath}:`, error.message);
    }
  }
}

module.exports = config;
