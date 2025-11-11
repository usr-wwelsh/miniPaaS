const WebSocket = require('ws');
const logAggregator = require('../services/logAggregator');
const db = require('../config/database');

function setupWebSocketServer(server) {
  const wss = new WebSocket.Server({ server, path: '/ws/logs' });

  wss.on('connection', (ws, req) => {
    console.log('WebSocket client connected');

    let deploymentId = null;

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);

        if (data.type === 'subscribe' && data.deploymentId) {
          deploymentId = data.deploymentId;

          const deployment = await db.query(
            'SELECT * FROM deployments WHERE id = $1',
            [deploymentId]
          );

          if (deployment.rows.length === 0) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Deployment not found'
            }));
            return;
          }

          const buildLogs = await logAggregator.getBuildLogs(deploymentId);
          buildLogs.forEach(log => {
            ws.send(JSON.stringify({
              type: 'log',
              source: 'build',
              data: log.log_line,
              timestamp: log.timestamp
            }));
          });

          if (deployment.rows[0].docker_container_id && deployment.rows[0].status === 'running') {
            const runtimeLogs = await logAggregator.getRuntimeLogs(deploymentId, 100);
            runtimeLogs.forEach(log => {
              ws.send(JSON.stringify({
                type: 'log',
                source: 'runtime',
                level: log.log_level,
                data: log.log_line,
                timestamp: log.timestamp
              }));
            });

            logAggregator.attachToContainer(
              deploymentId,
              deployment.rows[0].docker_container_id,
              (logLine) => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'log',
                    source: 'runtime',
                    data: logLine,
                    timestamp: new Date()
                  }));
                }
              }
            );
          }

          ws.send(JSON.stringify({
            type: 'subscribed',
            deploymentId: deploymentId
          }));
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
      }
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      if (deploymentId) {
        logAggregator.detachFromContainer(deploymentId);
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  return wss;
}

module.exports = setupWebSocketServer;
