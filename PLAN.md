# Local PaaS Platform - Complete Implementation Plan

## Project Overview

Build a self-contained, Railway-like Platform-as-a-Service (PaaS) that runs entirely on your local machine. This system will allow you to:
- Connect GitHub repositories via OAuth
- Automatically build projects with Docker
- Deploy to local subdomains (app1.localhost, app2.localhost)
- Monitor with built-in analytics (no external APIs)
- Stream real-time logs
- Manage environment variables intelligently
- Track visitor metrics and resource usage

**Goal**: Create a portfolio-worthy project demonstrating full-stack development, DevOps, containerization, and system design skills.

---

## Technology Stack

### Backend
**Node.js + Express**
- **Why**: Excellent Docker integration via `dockerode` library, native WebSocket support, strong job market demand
- **Alternatives considered**: Python (great for ML but Node.js better for real-time features), Go (powerful but steeper learning curve)
- **Version**: Node.js 20+ LTS

### Frontend
**Vanilla HTML/CSS/JavaScript**
- **Why**: No build complexity, demonstrates fundamental understanding, faster iteration
- **Libraries**:
  - Chart.js for analytics visualization
  - WebSocket API for real-time log streaming
  - Fetch API for REST calls

### Database
**PostgreSQL 15+**
- **Why**: Robust relational database, handles time-series data well (logs/analytics), JSON support for flexible schemas
- **Storage**: Projects, deployments, environment variables, build logs, runtime logs, analytics data

### Containerization
**Docker + Docker Compose**
- **Docker Engine**: Build and run user applications
- **Docker Compose**: Orchestrate PaaS infrastructure (PostgreSQL, Traefik, Control Plane)

### Reverse Proxy
**Traefik v3**
- **Why**:
  - Automatic service discovery via Docker labels
  - Built-in subdomain routing
  - Middleware support for analytics interception
  - Easy local `.localhost` domain handling
  - Future-ready (Let's Encrypt for production)
- **Alternative**: Nginx (more manual configuration), Caddy (good but less Docker-native)

### Additional Tools
- **dockerode**: Node.js Docker API client
- **Passport.js**: OAuth authentication
- **ws**: WebSocket server library
- **Octokit**: GitHub API client

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         YOUR BROWSER                            │
│  (localhost:3000 - Dashboard, app1.localhost, app2.localhost)   │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                      TRAEFIK (Port 80/443)                      │
│  • Routes *.localhost to correct container                      │
│  • Intercepts traffic for analytics via middleware              │
│  • Serves as reverse proxy                                      │
└────────┬───────────────────────────────────┬────────────────────┘
         │                                   │
         │                                   │ (User Apps Traffic)
         ▼                                   ▼
┌─────────────────────┐          ┌─────────────────────────────┐
│   CONTROL PLANE     │          │    USER CONTAINERS          │
│   (Node.js/Express) │          │  • app1 (user's project)    │
│   Port: 3000        │          │  • app2 (another project)   │
│                     │          │  • app3...                  │
│  • REST API         │          │                             │
│  • WebSocket Server │          │  Each has Traefik labels    │
│  • GitHub OAuth     │          │  for routing                │
│  • Build Engine     │          └─────────────────────────────┘
│  • Analytics Engine │
│  • Log Aggregator   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   POSTGRESQL        │
│   Port: 5432        │
│                     │
│  • projects         │
│  • deployments      │
│  • build_logs       │
│  • runtime_logs     │
│  • analytics_events │
│  • env_vars         │
└─────────────────────┘
```

### Traffic Flow

1. **Dashboard Access**: User visits `localhost:3000` → Traefik routes to Control Plane web UI
2. **User App Access**: User visits `app1.localhost` → Traefik routes to app1 container → Traefik middleware logs request to Control Plane analytics API
3. **Real-time Logs**: Dashboard opens WebSocket to Control Plane → Control Plane streams Docker container logs
4. **Deployments**: Dashboard triggers build → Control Plane clones repo → Builds Docker image → Starts container with Traefik labels

---

## Database Schema

### `projects` table
```sql
CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    subdomain VARCHAR(255) UNIQUE NOT NULL, -- e.g., "myapp" for myapp.localhost
    github_repo_url TEXT NOT NULL,
    github_repo_name VARCHAR(255),
    github_branch VARCHAR(255) DEFAULT 'main',
    github_access_token TEXT, -- encrypted
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### `deployments` table
```sql
CREATE TABLE deployments (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    commit_sha VARCHAR(40),
    status VARCHAR(50), -- 'building', 'running', 'failed', 'stopped'
    docker_image_id VARCHAR(255),
    docker_container_id VARCHAR(255),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### `env_vars` table
```sql
CREATE TABLE env_vars (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    key VARCHAR(255) NOT NULL,
    value TEXT NOT NULL, -- encrypted
    is_suggested BOOLEAN DEFAULT FALSE, -- auto-detected vs user-added
    created_at TIMESTAMP DEFAULT NOW()
);
```

### `build_logs` table
```sql
CREATE TABLE build_logs (
    id SERIAL PRIMARY KEY,
    deployment_id INTEGER REFERENCES deployments(id) ON DELETE CASCADE,
    log_line TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT NOW()
);
```

### `runtime_logs` table
```sql
CREATE TABLE runtime_logs (
    id SERIAL PRIMARY KEY,
    deployment_id INTEGER REFERENCES deployments(id) ON DELETE CASCADE,
    log_line TEXT NOT NULL,
    log_level VARCHAR(20), -- 'info', 'error', 'warn'
    timestamp TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_runtime_logs_deployment ON runtime_logs(deployment_id, timestamp);
```

### `analytics_events` table
```sql
CREATE TABLE analytics_events (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    event_type VARCHAR(50), -- 'http_request', 'container_stat'
    data JSONB NOT NULL, -- flexible storage for different event types
    timestamp TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_analytics_project_time ON analytics_events(project_id, timestamp);
CREATE INDEX idx_analytics_type ON analytics_events(event_type);

-- Example data structures:
-- HTTP Request: {"method": "GET", "path": "/", "status": 200, "ip": "127.0.0.1", "duration_ms": 45}
-- Container Stat: {"cpu_percent": 12.5, "memory_mb": 128, "disk_mb": 512}
```

### `users` table (for future multi-user support)
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    github_id INTEGER UNIQUE,
    github_username VARCHAR(255),
    github_access_token TEXT, -- encrypted
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Project Structure

```
1miniPaaS/
├── docker-compose.yml           # Infrastructure orchestration
├── .env.example                 # Environment variables template
├── PLAN.md                      # This file
├── README.md                    # Getting started guide
│
├── control-plane/               # Node.js backend
│   ├── package.json
│   ├── server.js                # Express app entry point
│   │
│   ├── config/
│   │   ├── database.js          # PostgreSQL connection
│   │   ├── docker.js            # Dockerode setup
│   │   └── github.js            # GitHub OAuth config
│   │
│   ├── routes/
│   │   ├── auth.js              # GitHub OAuth routes
│   │   ├── projects.js          # CRUD for projects
│   │   ├── deployments.js       # Build & deploy routes
│   │   ├── logs.js              # Log streaming endpoints
│   │   ├── analytics.js         # Analytics data endpoints
│   │   └── envVars.js           # Environment variable management
│   │
│   ├── services/
│   │   ├── githubService.js     # GitHub API interactions
│   │   ├── buildEngine.js       # Docker build orchestration
│   │   ├── deploymentService.js # Container lifecycle management
│   │   ├── logAggregator.js     # Docker log collection
│   │   ├── analyticsCollector.js # Analytics event processing
│   │   └── envDetector.js       # Auto-detect env vars from repos
│   │
│   ├── websockets/
│   │   └── logStreamer.js       # WebSocket server for real-time logs
│   │
│   ├── middleware/
│   │   ├── auth.js              # Authentication middleware
│   │   └── errorHandler.js      # Global error handling
│   │
│   └── utils/
│       ├── encryption.js        # Encrypt sensitive data
│       └── dockerfileGenerator.js # Generate Dockerfile if missing
│
├── dashboard/                   # Frontend
│   ├── index.html               # Main dashboard
│   ├── login.html               # GitHub OAuth landing
│   │
│   ├── css/
│   │   ├── main.css             # Global styles
│   │   ├── dashboard.css        # Dashboard specific
│   │   └── logs.css             # Log viewer styles
│   │
│   ├── js/
│   │   ├── api.js               # API client wrapper
│   │   ├── projects.js          # Project list/create logic
│   │   ├── deployment.js        # Deploy button handlers
│   │   ├── logs.js              # Real-time log viewer (WebSocket)
│   │   ├── analytics.js         # Analytics dashboard (Chart.js)
│   │   ├── envVars.js           # Env var editor
│   │   └── utils.js             # Helper functions
│   │
│   └── assets/
│       └── chart.min.js         # Chart.js library (local copy)
│
├── traefik/
│   ├── traefik.yml              # Static configuration
│   └── dynamic/
│       └── middleware.yml       # Analytics middleware config
│
├── database/
│   ├── init.sql                 # Initial schema creation
│   └── migrations/              # Future schema changes
│       └── 001_initial.sql
│
└── scripts/
    ├── setup.sh                 # Initial setup script
    └── teardown.sh              # Cleanup script
```

---

## Core Components Breakdown

### 1. Control Plane API (Node.js/Express)

**Responsibilities**:
- Serve the dashboard frontend
- Handle GitHub OAuth flow
- Manage projects and deployments
- Trigger Docker builds
- Stream logs via WebSocket
- Collect and serve analytics data

**Key Endpoints**:

```javascript
// Authentication
GET  /auth/github          // Redirect to GitHub OAuth
GET  /auth/github/callback // OAuth callback
GET  /auth/user            // Get current user info

// Projects
GET    /api/projects       // List all projects
POST   /api/projects       // Create new project
GET    /api/projects/:id   // Get project details
PUT    /api/projects/:id   // Update project
DELETE /api/projects/:id   // Delete project & containers

// Deployments
POST   /api/projects/:id/deploy      // Trigger new deployment
GET    /api/projects/:id/deployments // List deployments
GET    /api/deployments/:id          // Get deployment details
POST   /api/deployments/:id/stop     // Stop running deployment
DELETE /api/deployments/:id          // Remove deployment

// Environment Variables
GET    /api/projects/:id/env         // List env vars
POST   /api/projects/:id/env         // Add env var
PUT    /api/projects/:id/env/:key    // Update env var
DELETE /api/projects/:id/env/:key    // Delete env var
GET    /api/projects/:id/env/suggest // Get suggested env vars

// Logs
GET    /api/deployments/:id/build-logs    // Get build logs
GET    /api/deployments/:id/runtime-logs  // Get runtime logs (paginated)
WS     /ws/logs/:deploymentId             // WebSocket for real-time logs

// Analytics
GET    /api/projects/:id/analytics        // Get analytics data
POST   /api/analytics/event               // Record analytics event (internal)
GET    /api/projects/:id/visitors         // Unique visitor stats
GET    /api/projects/:id/requests         // Request metrics
GET    /api/projects/:id/resources        // Resource usage metrics
```

### 2. Build Engine

**Flow**:
1. Receive deployment request
2. Clone GitHub repo to temporary directory
3. Detect project type (Node.js, Python, Go, static HTML, etc.)
4. Check for Dockerfile, generate if missing
5. Build Docker image with streaming logs
6. Tag image with deployment ID
7. Store build logs in database
8. Return success/failure status

**Dockerfile Generation Logic**:
```javascript
// Detect project type
if (fs.existsSync('package.json')) {
  // Node.js project
  generateNodeDockerfile();
} else if (fs.existsSync('requirements.txt')) {
  // Python project
  generatePythonDockerfile();
} else if (fs.existsSync('go.mod')) {
  // Go project
  generateGoDockerfile();
} else if (fs.existsSync('index.html')) {
  // Static site
  generateNginxDockerfile();
}
```

**Example Generated Dockerfile (Node.js)**:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### 3. Deployment Service

**Responsibilities**:
- Start Docker containers from built images
- Apply Traefik labels for routing
- Inject environment variables
- Monitor container health
- Handle container lifecycle (stop, restart, remove)

**Traefik Labels Example**:
```javascript
const labels = {
  'traefik.enable': 'true',
  [`traefik.http.routers.${projectName}.rule`]: `Host(\`${subdomain}.localhost\`)`,
  [`traefik.http.services.${projectName}.loadbalancer.server.port`]: containerPort,
  [`traefik.http.routers.${projectName}.middlewares`]: 'analytics-collector'
};
```

### 4. Log Aggregator

**Build Logs**:
- Stream Docker build output in real-time
- Store each line in `build_logs` table
- Detect errors and mark deployment status

**Runtime Logs**:
- Attach to running container's stdout/stderr
- Parse log lines for severity (INFO, WARN, ERROR)
- Store in `runtime_logs` table
- Stream to WebSocket clients watching that deployment

**WebSocket Protocol**:
```javascript
// Client connects
ws.on('connection', (socket) => {
  socket.on('subscribe', (deploymentId) => {
    // Add socket to room for that deployment
    rooms[deploymentId].add(socket);
  });
});

// Server broadcasts new log
broadcastLog(deploymentId, logLine) {
  rooms[deploymentId].forEach(socket => {
    socket.send(JSON.stringify({ type: 'log', data: logLine }));
  });
}
```

### 5. Analytics Collector

**Traffic Interception**:
Traefik middleware forwards request metadata to Control Plane:

```yaml
# traefik/dynamic/middleware.yml
http:
  middlewares:
    analytics-collector:
      plugin:
        # Custom Traefik middleware that POSTs to /api/analytics/event
        # OR use Traefik access logs and parse them in Node.js
```

**Alternative Approach** (simpler for local setup):
Parse Traefik access logs in real-time:
```javascript
// Tail Traefik access log file
const tail = new Tail('/var/log/traefik/access.log');
tail.on('line', (line) => {
  const parsed = parseTraefikLog(line);
  if (parsed.host.endsWith('.localhost')) {
    storeAnalyticsEvent(parsed);
  }
});
```

**Metrics Collected**:
- **HTTP Requests**: Method, path, status code, response time, IP address, user agent
- **Unique Visitors**: Track unique IPs per project per day
- **Resource Usage**: Poll Docker stats API every 30 seconds for CPU/memory/disk usage

**Container Stats Collection**:
```javascript
setInterval(async () => {
  const containers = await docker.listContainers({ all: false });

  for (const containerInfo of containers) {
    const container = docker.getContainer(containerInfo.Id);
    const stats = await container.stats({ stream: false });

    const cpuPercent = calculateCPUPercent(stats);
    const memoryMB = stats.memory_stats.usage / 1024 / 1024;

    await storeAnalyticsEvent({
      project_id: getProjectFromContainer(containerInfo),
      event_type: 'container_stat',
      data: { cpu_percent: cpuPercent, memory_mb: memoryMB }
    });
  }
}, 30000); // Every 30 seconds
```

### 6. Environment Variable Manager

**Auto-Detection**:
```javascript
async function detectEnvVars(repoPath) {
  const suggestions = [];

  // Node.js
  if (fs.existsSync(`${repoPath}/package.json`)) {
    const pkg = JSON.parse(fs.readFileSync(`${repoPath}/package.json`));
    if (pkg.dependencies?.['express']) {
      suggestions.push({ key: 'PORT', value: '3000', reason: 'Express app' });
    }
    if (pkg.dependencies?.['mongoose']) {
      suggestions.push({ key: 'MONGODB_URI', value: '', reason: 'Mongoose detected' });
    }
  }

  // Python
  if (fs.existsSync(`${repoPath}/requirements.txt`)) {
    const reqs = fs.readFileSync(`${repoPath}/requirements.txt`, 'utf-8');
    if (reqs.includes('django')) {
      suggestions.push({ key: 'SECRET_KEY', value: '', reason: 'Django app' });
      suggestions.push({ key: 'DEBUG', value: 'False', reason: 'Django app' });
    }
  }

  // Look for .env.example
  if (fs.existsSync(`${repoPath}/.env.example`)) {
    const envExample = fs.readFileSync(`${repoPath}/.env.example`, 'utf-8');
    const vars = parseEnvFile(envExample);
    suggestions.push(...vars);
  }

  return suggestions;
}
```

**Template Library**:
```javascript
const templates = {
  'node-express': [
    { key: 'PORT', value: '3000' },
    { key: 'NODE_ENV', value: 'production' }
  ],
  'python-django': [
    { key: 'SECRET_KEY', value: '' },
    { key: 'DEBUG', value: 'False' },
    { key: 'ALLOWED_HOSTS', value: 'localhost' }
  ],
  'database': [
    { key: 'DATABASE_URL', value: 'postgresql://user:pass@localhost:5432/db' },
    { key: 'DB_HOST', value: 'localhost' },
    { key: 'DB_PORT', value: '5432' }
  ]
};
```

### 7. Dashboard Frontend

**Pages**:
1. **Login Page** (`login.html`)
   - "Connect with GitHub" button
   - Redirects to GitHub OAuth

2. **Projects Dashboard** (`index.html`)
   - List of all projects with status indicators
   - "New Project" button
   - Quick stats (total deployments, active containers)

3. **Project Detail View** (SPA route or `project.html?id=123`)
   - Deployment history
   - Current deployment status
   - "Deploy Now" button
   - Tabs:
     - Overview (status, URL, last deployed)
     - Logs (real-time log viewer)
     - Analytics (charts and metrics)
     - Environment Variables (editor)
     - Settings (repo URL, branch, danger zone)

**Key UI Components**:

```javascript
// Real-time log viewer
class LogViewer {
  constructor(deploymentId) {
    this.ws = new WebSocket(`ws://localhost:3000/ws/logs/${deploymentId}`);
    this.ws.onmessage = (event) => {
      const { type, data } = JSON.parse(event.data);
      this.appendLog(data);
    };
  }

  appendLog(line) {
    const logContainer = document.getElementById('logs');
    const logLine = document.createElement('div');
    logLine.className = `log-line ${this.getLogClass(line)}`;
    logLine.textContent = line;
    logContainer.appendChild(logLine);
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  getLogClass(line) {
    if (line.includes('ERROR') || line.includes('error')) return 'log-error';
    if (line.includes('WARN')) return 'log-warn';
    return 'log-info';
  }
}

// Analytics dashboard with Chart.js
async function renderAnalytics(projectId) {
  const data = await fetch(`/api/projects/${projectId}/analytics`).then(r => r.json());

  // Requests over time
  new Chart(document.getElementById('requestsChart'), {
    type: 'line',
    data: {
      labels: data.requestsByHour.map(d => d.hour),
      datasets: [{
        label: 'Requests',
        data: data.requestsByHour.map(d => d.count),
        borderColor: 'rgb(75, 192, 192)'
      }]
    }
  });

  // Status code distribution
  new Chart(document.getElementById('statusChart'), {
    type: 'pie',
    data: {
      labels: ['2xx', '3xx', '4xx', '5xx'],
      datasets: [{
        data: [data.status2xx, data.status3xx, data.status4xx, data.status5xx]
      }]
    }
  });

  // Resource usage
  new Chart(document.getElementById('resourceChart'), {
    type: 'line',
    data: {
      labels: data.resourcesByTime.map(d => d.timestamp),
      datasets: [
        { label: 'CPU %', data: data.resourcesByTime.map(d => d.cpu), yAxisID: 'y' },
        { label: 'Memory MB', data: data.resourcesByTime.map(d => d.memory), yAxisID: 'y1' }
      ]
    },
    options: {
      scales: {
        y: { type: 'linear', position: 'left' },
        y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false } }
      }
    }
  });
}
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
**Goal**: Set up infrastructure and basic API

1. Create project structure
2. Set up Docker Compose with:
   - PostgreSQL container
   - Traefik container (basic config)
3. Initialize PostgreSQL schema (`database/init.sql`)
4. Create Express server with basic routes
5. Serve static dashboard HTML
6. Test: Visit `localhost:3000` and see dashboard

**Deliverables**:
- `docker-compose.yml` working
- Database tables created
- Express server responding
- Basic HTML page loading

### Phase 2: GitHub Integration (Week 1-2)
**Goal**: Authenticate and list repositories

1. Set up GitHub OAuth App (https://github.com/settings/developers)
2. Implement OAuth flow in Express
3. Store user tokens in database (encrypted)
4. Use Octokit to list user's repositories
5. Create "New Project" form that lists repos
6. Test: Connect GitHub account and see repo list

**Deliverables**:
- OAuth flow working
- Can list GitHub repos
- Create project form functional

### Phase 3: Build System (Week 2-3)
**Goal**: Clone repos and build Docker images

1. Implement `buildEngine.js`:
   - Clone GitHub repo with simple-git
   - Detect project type
   - Generate Dockerfile if needed
   - Build Docker image with dockerode
   - Stream build logs to database
2. Create `/api/projects/:id/deploy` endpoint
3. Create build status UI in dashboard
4. Test: Deploy a simple Node.js app and see build logs

**Deliverables**:
- Can clone and build GitHub repos
- Build logs stored and displayed
- Dockerfile generation working

### Phase 4: Deployment & Routing (Week 3-4)
**Goal**: Run containers and access via subdomains

1. Implement `deploymentService.js`:
   - Start container from built image
   - Apply Traefik labels
   - Inject environment variables
   - Register in deployments table
2. Configure Traefik for `*.localhost` routing
3. Implement container stop/restart
4. Test: Deploy app and visit `appname.localhost`

**Deliverables**:
- Apps accessible via subdomains
- Container lifecycle management working
- Can stop/start deployments from dashboard

### Phase 5: Real-time Logging (Week 4-5)
**Goal**: Stream logs to dashboard

1. Implement `logAggregator.js`:
   - Attach to container stdout/stderr
   - Store logs in database
   - Detect log levels
2. Create WebSocket server for log streaming
3. Build log viewer UI with auto-scroll
4. Test: Watch logs stream in real-time during deployment

**Deliverables**:
- Build logs stream during builds
- Runtime logs stream from running apps
- Log viewer UI with filtering

### Phase 6: Analytics Engine (Week 5-6)
**Goal**: Track traffic and resource usage

1. Set up Traefik access logging
2. Implement log parser to extract metrics
3. Store in `analytics_events` table
4. Create analytics aggregation queries
5. Implement resource monitoring (Docker stats)
6. Build analytics dashboard with Chart.js
7. Test: Generate traffic and see charts update

**Deliverables**:
- HTTP request tracking working
- Unique visitor counting
- Resource usage graphs
- Analytics dashboard complete

### Phase 7: Environment Variables (Week 6-7)
**Goal**: Smart env var management

1. Implement `envDetector.js` with framework detection
2. Create env var templates library
3. Build env var editor UI
4. Implement encryption for sensitive values
5. Add env var injection to deployment process
6. Test: Auto-detect vars from a repo, edit them, deploy

**Deliverables**:
- Auto-detection working for Node.js/Python
- Template library functional
- Env vars securely stored and injected
- Editor UI complete

### Phase 8: Polish & Testing (Week 7-8)
**Goal**: Bug fixes and user experience improvements

1. Add error handling throughout
2. Improve UI/UX (loading states, error messages)
3. Add health checks for deployments
4. Implement cleanup for old deployments
5. Write README with setup instructions
6. Test entire flow end-to-end
7. Record demo video for portfolio

**Deliverables**:
- Production-ready error handling
- Polished UI
- Complete documentation
- Demo-ready

---

## Traefik Configuration

### `traefik/traefik.yml` (Static Configuration)
```yaml
# API and Dashboard
api:
  dashboard: true
  insecure: true  # Only for local dev

# Entry points
entryPoints:
  web:
    address: ":80"

# Docker provider
providers:
  docker:
    endpoint: "unix:///var/run/docker.sock"
    exposedByDefault: false
    network: "paas_network"

# Access logs for analytics
accessLog:
  filePath: "/var/log/traefik/access.log"
  format: json
```

### `docker-compose.yml` Traefik Service
```yaml
version: '3.8'

services:
  traefik:
    image: traefik:v3.0
    ports:
      - "80:80"
      - "8080:8080"  # Traefik dashboard
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./traefik/traefik.yml:/etc/traefik/traefik.yml:ro
      - ./traefik/logs:/var/log/traefik
    networks:
      - paas_network

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: paasuser
      POSTGRES_PASSWORD: paaspass
      POSTGRES_DB: paasdb
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/init.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - paas_network
    ports:
      - "5432:5432"

  control-plane:
    build: ./control-plane
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://paasuser:paaspass@postgres:5432/paasdb
      GITHUB_CLIENT_ID: ${GITHUB_CLIENT_ID}
      GITHUB_CLIENT_SECRET: ${GITHUB_CLIENT_SECRET}
      SESSION_SECRET: ${SESSION_SECRET}
      DOCKER_SOCKET: /var/run/docker.sock
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./control-plane:/app
      - /app/node_modules
      - build_cache:/tmp/builds
    networks:
      - paas_network
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.dashboard.rule=Host(`localhost`)"
      - "traefik.http.services.dashboard.loadbalancer.server.port=3000"
    depends_on:
      - postgres
      - traefik

networks:
  paas_network:
    driver: bridge

volumes:
  postgres_data:
  build_cache:
```

---

## Getting Started

### Prerequisites
- Docker Desktop installed (Windows/Mac) or Docker Engine + Docker Compose (Linux)
- Node.js 20+ installed
- GitHub account
- Git installed

### Setup Steps

1. **Clone this repository**
   ```bash
   git clone <your-repo>
   cd 1miniPaaS
   ```

2. **Create GitHub OAuth App**
   - Go to https://github.com/settings/developers
   - Click "New OAuth App"
   - Application name: "Local PaaS"
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/auth/github/callback`
   - Note down Client ID and Client Secret

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env and add your GitHub OAuth credentials
   ```

   `.env` file:
   ```
   GITHUB_CLIENT_ID=your_client_id
   GITHUB_CLIENT_SECRET=your_client_secret
   SESSION_SECRET=random_string_for_session_encryption
   ```

4. **Install dependencies**
   ```bash
   cd control-plane
   npm install
   cd ..
   ```

5. **Start the platform**
   ```bash
   docker-compose up -d
   ```

6. **Initialize database** (first time only)
   ```bash
   docker-compose exec postgres psql -U paasuser -d paasdb -f /docker-entrypoint-initdb.d/init.sql
   ```

7. **Access the dashboard**
   - Open browser to http://localhost:3000
   - Click "Connect with GitHub"
   - Authorize the app
   - Start deploying!

### Deploying Your First App

1. Click "New Project" in dashboard
2. Select a GitHub repository (must have a `package.json` or Dockerfile)
3. Choose subdomain (e.g., "myapp" → `myapp.localhost`)
4. Configure environment variables (auto-suggested)
5. Click "Deploy"
6. Watch build logs in real-time
7. Once deployed, visit `myapp.localhost` in your browser

### Troubleshooting

**Can't access *.localhost domains?**
- Windows: Should work out of the box
- Mac: Should work out of the box
- Linux: Add to `/etc/hosts`: `127.0.0.1 *.localhost`

**Docker build fails?**
- Check build logs in dashboard
- Ensure Dockerfile or framework detection is correct
- Verify repo has proper dependencies file

**Can't connect to GitHub?**
- Verify OAuth credentials in `.env`
- Check callback URL matches exactly
- Ensure localhost:3000 is accessible

---

## Security Considerations

### For Local Development
- Traefik API is insecure (acceptable for local use)
- Session secrets should be random strings
- GitHub tokens are encrypted before storage
- Environment variables are encrypted in database

### For Future Production Use
1. Enable HTTPS with Let's Encrypt
2. Secure Traefik API with authentication
3. Implement user isolation (containers in separate networks)
4. Add rate limiting
5. Implement resource quotas per project
6. Add RBAC (Role-Based Access Control)
7. Implement webhook signature verification
8. Add CSRF protection
9. Sanitize all user inputs
10. Implement audit logging

---

## Advanced Features (Future Enhancements)

### Short-term
- [ ] Automatic deployments via GitHub webhooks
- [ ] Rollback to previous deployment
- [ ] Multi-environment support (staging, production)
- [ ] Custom domains (for production with DNS)
- [ ] SSL certificate management
- [ ] Database service provisioning (PostgreSQL, MySQL, Redis)

### Long-term
- [ ] Multi-user support with teams
- [ ] Resource quotas and billing
- [ ] Horizontal scaling (multiple replicas)
- [ ] CI/CD pipeline integration
- [ ] Marketplace for add-ons
- [ ] CLI tool for deployments
- [ ] GitLab/Bitbucket support
- [ ] Kubernetes as orchestrator (for production)

---

## Learning Outcomes

By completing this project, you'll gain hands-on experience with:

1. **Backend Development**: Node.js, Express, REST APIs, WebSockets
2. **DevOps**: Docker, Docker Compose, container orchestration
3. **Databases**: PostgreSQL, schema design, time-series data
4. **Reverse Proxy**: Traefik configuration, dynamic routing
5. **OAuth**: GitHub authentication flow
6. **Real-time Features**: WebSocket communication, log streaming
7. **Analytics**: Data collection, aggregation, visualization
8. **System Design**: Microservices architecture, event-driven design
9. **Security**: Encryption, token management, secure practices
10. **Frontend**: Vanilla JavaScript, WebSocket clients, Chart.js

This project demonstrates to potential employers:
- Full-stack capabilities
- DevOps knowledge
- Complex system integration
- Real-world problem solving
- Self-directed learning

---

## Resources

### Documentation
- Docker API (dockerode): https://github.com/apocas/dockerode
- Traefik: https://doc.traefik.io/traefik/
- GitHub OAuth: https://docs.github.com/en/developers/apps/building-oauth-apps
- Chart.js: https://www.chartjs.org/docs/latest/
- PostgreSQL: https://www.postgresql.org/docs/

### Similar Projects (for inspiration)
- Dokku: https://github.com/dokku/dokku
- CapRover: https://github.com/caprover/caprover
- Coolify: https://github.com/coollabsio/coolify

### Tutorials
- Dockerizing Node.js apps
- Building real-time dashboards with WebSockets
- PostgreSQL for time-series data
- OAuth 2.0 flow explained

---

## Next Steps

1. Read through this entire plan
2. Set up your development environment
3. Start with Phase 1: Foundation
4. Work through phases sequentially
5. Test each feature before moving to the next phase
6. Document challenges and solutions
7. Create a portfolio page showcasing this project
8. Record demo video for GitHub README

**Estimated Timeline**: 6-8 weeks working 10-15 hours/week

Good luck building your PaaS! This project will be a strong portfolio piece. Remember: focus on getting core features working first, then polish.

---

## Questions or Issues?

As you build this, you'll encounter challenges. That's normal and expected! When stuck:
1. Check Docker logs: `docker-compose logs <service>`
2. Review Traefik dashboard: http://localhost:8080
3. Inspect PostgreSQL: `docker-compose exec postgres psql -U paasuser -d paasdb`
4. Debug Node.js: Add `console.log` or use VS Code debugger
5. Search GitHub Issues for similar projects (Dokku, CapRover)

**You've got this!** 🚀
