const fs = require('fs');
const path = require('path');

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'INFO'];

const SENSITIVE_PATTERNS = [
  /password[=:]\s*["']?([^"'\s]+)["']?/gi,
  /secret[=:]\s*["']?([^"'\s]+)["']?/gi,
  /token[=:]\s*["']?([^"'\s]+)["']?/gi,
  /api[_-]?key[=:]\s*["']?([^"'\s]+)["']?/gi,
  /auth[=:]\s*["']?([^"'\s]+)["']?/gi
];

function maskSecrets(message) {
  let maskedMessage = message;

  SENSITIVE_PATTERNS.forEach(pattern => {
    maskedMessage = maskedMessage.replace(pattern, (match, value) => {
      return match.replace(value, '***REDACTED***');
    });
  });

  return maskedMessage;
}

function formatMessage(level, message, context = {}) {
  const timestamp = new Date().toISOString();
  const contextStr = Object.keys(context).length > 0
    ? ` [${Object.entries(context).map(([k, v]) => `${k}=${v}`).join(', ')}]`
    : '';

  return `[${timestamp}] [${level}]${contextStr} ${message}`;
}

function shouldLog(level) {
  return LOG_LEVELS[level] >= currentLogLevel;
}

function debug(message, context = {}) {
  if (!shouldLog('DEBUG')) return;

  const formattedMessage = formatMessage('DEBUG', maskSecrets(message), context);
  console.log(formattedMessage);
}

function info(message, context = {}) {
  if (!shouldLog('INFO')) return;

  const formattedMessage = formatMessage('INFO', maskSecrets(message), context);
  console.log(formattedMessage);
}

function warn(message, context = {}) {
  if (!shouldLog('WARN')) return;

  const formattedMessage = formatMessage('WARN', maskSecrets(message), context);
  console.warn(formattedMessage);
}

function error(message, errorObj = null, context = {}) {
  if (!shouldLog('ERROR')) return;

  let fullMessage = message;
  if (errorObj) {
    fullMessage += ` Error: ${errorObj.message}`;
    if (errorObj.stack && process.env.NODE_ENV !== 'production') {
      fullMessage += `\nStack: ${errorObj.stack}`;
    }
  }

  const formattedMessage = formatMessage('ERROR', maskSecrets(fullMessage), context);
  console.error(formattedMessage);
}

function logDeployment(deploymentId, projectId, message, level = 'INFO') {
  const context = { deploymentId, projectId };

  switch (level) {
    case 'DEBUG':
      debug(message, context);
      break;
    case 'WARN':
      warn(message, context);
      break;
    case 'ERROR':
      error(message, null, context);
      break;
    default:
      info(message, context);
  }
}

function logProject(projectId, message, level = 'INFO') {
  const context = { projectId };

  switch (level) {
    case 'DEBUG':
      debug(message, context);
      break;
    case 'WARN':
      warn(message, context);
      break;
    case 'ERROR':
      error(message, null, context);
      break;
    default:
      info(message, context);
  }
}

module.exports = {
  debug,
  info,
  warn,
  error,
  logDeployment,
  logProject,
  maskSecrets
};
