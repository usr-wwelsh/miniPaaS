module.exports = {
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
