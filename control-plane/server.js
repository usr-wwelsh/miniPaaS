require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const db = require('./config/database');
const passport = require('./config/github');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const http = require('http');
const path = require('path');

const authRoutes = require('./routes/auth');
const projectsRoutes = require('./routes/projects');
const deploymentsRoutes = require('./routes/deployments');
const logsRoutes = require('./routes/logs');
const analyticsRoutes = require('./routes/analytics');
const envVarsRoutes = require('./routes/envVars');

const errorHandler = require('./middleware/errorHandler');
const setupWebSocketServer = require('./websockets/logStreamer');
const analyticsCollector = require('./services/analyticsCollector');
const statusMonitor = require('./services/statusMonitor');

const app = express();
const server = http.createServer(app);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: new pgSession({
    pool: db.pool, // Use the existing database connection pool
    tableName: 'session', // Table will be created automatically
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days instead of 1 day
  }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(express.static(path.join(__dirname, 'public')));

app.use('/auth', authRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api', deploymentsRoutes);
app.use('/api', logsRoutes);
app.use('/api', analyticsRoutes);
app.use('/api', envVarsRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(errorHandler);

setupWebSocketServer(server);

analyticsCollector.startStatsCollection();
statusMonitor.start();

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`miniPaaS Control Plane running on port ${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}/ws/logs`);
});

process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  analyticsCollector.stopStatsCollection();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
