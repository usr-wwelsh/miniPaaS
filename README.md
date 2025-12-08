# miniPaaS

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Required-blue.svg)](https://www.docker.com/)

**Test your deployments before production breaks.**

Local PaaS for simulating production deployments on your machine. Catches port issues, build failures, and routing problems before they hit real servers.

## Screenshots

<div align="center">
  <img src="demo1.png" alt="miniPaaS Dashboard" width="800"/>
  <p><em>Dashboard with deployed projects</em></p>

  <img src="demo2.png" alt="miniPaaS Deployment" width="800"/>
  <p><em>Real-time deployment logs</em></p>
</div>

## How It Works

```mermaid
graph LR
    A[Click Deploy] --> B[Clone from GitHub]
    B --> C{Detect Project Type}
    C -->|Node.js/Vite| D1[Generate Dockerfile]
    C -->|Python/Flask| D1
    C -->|Go| D1
    C -->|Has Dockerfile| D2[Use Existing]
    D1 --> E[Docker Build]
    D2 --> E
    E --> F[Start Container]
    F --> G[Traefik Routes Traffic]
    G --> H[Live at subdomain.localhost]

    style A fill:#6366f1,stroke:#4f46e5,stroke-width:2px,color:#fff
    style H fill:#10b981,stroke:#059669,stroke-width:2px,color:#fff
    style G fill:#f59e0b,stroke:#d97706,stroke-width:2px,color:#fff
    style E fill:#3b82f6,stroke:#2563eb,stroke-width:2px,color:#fff
```

**GitHub → Build → Deploy → Test at `yourapp.localhost`**

## What It Does

- Auto-detects project type (Node.js, Python, Go, static sites)
- Builds Docker images and routes traffic through Traefik
- Shows real-time pipeline status with health checks
- Catches bad gateway errors, port mismatches, and build failures
- Manages environment variables and persistent storage

## Requirements

- Docker Desktop
- GitHub account for OAuth

## Quick Start

```bash
git clone https://github.com/usr-wwelsh/miniPaaS.git
cd miniPaaS

# Create GitHub OAuth app at https://github.com/settings/developers
# Use http://localhost:3000/auth/github/callback as callback URL

cp .env.example .env
# Add your GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET

docker-compose up -d
```

Open **http://localhost:3000**, connect your GitHub account, and start deploying.

## Project Structure

```
miniPaaS/
├── control-plane/          # Node.js backend
│   ├── config/            # Database, Docker, GitHub config
│   ├── routes/            # API routes
│   ├── services/          # Business logic
│   ├── websockets/        # WebSocket server
│   ├── middleware/        # Express middleware
│   └── utils/             # Helper utilities
├── dashboard/             # Frontend
│   ├── css/              # Stylesheets
│   ├── js/               # JavaScript
│   └── assets/           # Static assets
├── database/              # SQL schemas
├── traefik/              # Traefik configuration
└── docker-compose.yml    # Infrastructure orchestration
```

## Supported Languages

Auto-detects Node.js, Python, Go, and static HTML sites. Existing Dockerfiles work too.

## Architecture

```
Browser → Traefik → Control Plane + User Containers → PostgreSQL
```

## License

MIT
