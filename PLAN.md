# miniPaaS Enhancement Plan

## Overview

This document outlines planned improvements to miniPaaS, a self-hosted platform-as-a-service for deploying applications from GitHub repositories.

---

## 1. Persistent Volume Storage System

### 1.1 Database Schema

Add new tables to track volumes and their metadata:

```sql
CREATE TABLE volumes (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    mount_path VARCHAR(255) NOT NULL DEFAULT '/app/storage',
    size_bytes BIGINT DEFAULT 0,
    max_size_bytes BIGINT DEFAULT 5368709120, -- 5GB default
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(project_id, name)
);

CREATE TABLE volume_files (
    id SERIAL PRIMARY KEY,
    volume_id INTEGER REFERENCES volumes(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(255),
    uploaded_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(volume_id, file_path)
);
```

### 1.2 Volume Management Service

Create `control-plane/services/volumeManager.js`:

- `createVolume(projectId, name, mountPath)` - Create Docker volume
- `deleteVolume(volumeId)` - Remove volume and data
- `getVolumeStats(volumeId)` - Calculate size/file count
- `listFiles(volumeId, path)` - Browse volume contents
- `uploadFile(volumeId, path, fileStream)` - Write file to volume
- `downloadFile(volumeId, path)` - Read file from volume
- `deleteFile(volumeId, path)` - Remove file from volume

Implementation notes:
- Use Docker volume API to create named volumes
- Volume naming: `minipaas-vol-{project-id}-{volume-id}`
- Access files via temporary container mounts or docker cp
- Track file metadata in database for quick lookups
- Implement size quotas and validation

### 1.3 Container Integration

Update `control-plane/services/deploymentService.js`:

Modify container creation to mount volumes:

```javascript
HostConfig: {
  NetworkMode: '1minipaas_paas_network',
  RestartPolicy: { Name: 'unless-stopped' },
  Binds: volumeMounts.map(v => `${v.dockerVolumeName}:${v.mountPath}`)
}
```

Auto-create default volume on first deployment if configured.

### 1.4 API Endpoints

Add to `control-plane/routes/volumes.js`:

```
POST   /api/projects/:id/volumes              - Create volume
GET    /api/projects/:id/volumes              - List project volumes
DELETE /api/volumes/:id                       - Delete volume
GET    /api/volumes/:id/files                 - List files (query: path)
POST   /api/volumes/:id/files                 - Upload file
GET    /api/volumes/:id/files/download        - Download file (query: path)
DELETE /api/volumes/:id/files                 - Delete file (query: path)
GET    /api/volumes/:id/stats                 - Get usage statistics
```

Use multipart/form-data for uploads.
Stream file downloads for large files.
Validate paths to prevent directory traversal.

### 1.5 Frontend UI

#### Volume Management Tab

Add "Storage" tab to project detail modal (`dashboard/js/storage.js`):

```
┌─────────────────────────────────────────┐
│ Storage Volumes                    [+]  │
├─────────────────────────────────────────┤
│                                         │
│ Name: project-storage                  │
│ Mount Path: /app/storage                │
│ Size: 247 MB / 5 GB                     │
│ Files: 142                              │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ Path: /                        [↑]  │ │
│ ├─────────────────────────────────────┤ │
│ │ [DIR] music/              2.1 GB   │ │
│ │ [DIR] uploads/            45 MB    │ │
│ │ [FILE] config.json        2 KB [×] │ │
│ │ [FILE] data.db            128 MB   │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [Upload Files]  [New Folder]            │
└─────────────────────────────────────────┘
```

Features:
- File browser with breadcrumb navigation
- Click folders to navigate
- Upload multiple files via input or drag-drop
- Download files on click
- Delete with confirmation
- Size progress bars
- Real-time usage updates

Styling: Minimal, monospaced fonts, simple borders, no animations.

---

## 2. Landing Page

### 2.1 Requirements

Create `dashboard/landing.html` - Pre-authentication landing page.

Design aesthetic:
- Early 2000s web design
- Centered content box
- Basic HTML table layouts
- System fonts only
- No CSS frameworks
- Static, no JavaScript animations
- Very simple, direct language

### 2.2 Page Structure

```html
<!DOCTYPE html>
<html>
<head>
    <title>miniPaaS</title>
    <style>
        body {
            background-color: #c0c0c0;
            font-family: "Courier New", monospace;
            margin: 0;
            padding: 20px;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border: 2px solid #000000;
            padding: 20px;
        }
        .header {
            text-align: right;
            margin-bottom: 20px;
        }
        .main-box {
            border: 1px solid #000000;
            padding: 30px;
            text-align: center;
            background-color: #f0f0f0;
        }
        h1 {
            font-size: 24px;
            margin: 0 0 20px 0;
        }
        p {
            line-height: 1.6;
            margin: 10px 0;
        }
        .login-btn {
            background-color: #ffffff;
            border: 2px solid #000000;
            padding: 8px 16px;
            font-family: "Courier New", monospace;
            font-size: 14px;
            cursor: pointer;
            text-decoration: none;
            color: #000000;
            display: inline-block;
        }
        .footer {
            margin-top: 20px;
            text-align: center;
            font-size: 11px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <a href="/auth/github" class="login-btn">Login with GitHub</a>
        </div>

        <div class="main-box">
            <h1>miniPaaS</h1>
            <h2>YOUR cloud</h2>

            <p>Deploy applications from GitHub repositories to Docker containers.</p>
            <p>Automatic builds. Environment variables. Live logs. Local or remote.</p>
            <p>Self-hosted platform-as-a-service with minimal dependencies.</p>
        </div>

        <div class="footer">
            <p>Created by wedsmoker</p>
            <p><a href="https://github.com/wedsmoker">github.com/wedsmoker</a></p>
        </div>
    </div>
</body>
</html>
```

### 2.3 Routing Changes

Update `control-plane/server.js`:

```javascript
app.get('/', (req, res) => {
  if (req.isAuthenticated()) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.sendFile(path.join(__dirname, 'public', 'landing.html'));
  }
});
```

---

## 3. System Robustness Improvements

### 3.1 Health Checks and Recovery

Create `control-plane/services/healthMonitor.js`:

- Monitor Traefik connectivity
- Verify PostgreSQL connection pool
- Check Docker daemon responsiveness
- Detect orphaned containers
- Auto-restart failed deployments (configurable)
- Health check endpoint: `GET /api/health/detailed`

### 3.2 Build Queue System

Current limitation: Parallel builds can overwhelm system.

Solution: Implement build queue.

Create `control-plane/services/buildQueue.js`:

- Queue deployments instead of building immediately
- Process builds sequentially or with configurable concurrency
- Add deployment states: `queued`, `building`, `running`, `failed`
- Show queue position in UI
- Retry failed builds with exponential backoff

Update UI to show queue status and position.

### 3.3 Deployment Rollback

Add ability to rollback to previous deployment.

Implementation:
- Keep last N Docker images per project
- Add "Rollback" button next to each deployment
- Creates new deployment using old image
- Fast rollback without rebuild

Database changes:
```sql
ALTER TABLE deployments ADD COLUMN can_rollback BOOLEAN DEFAULT true;
ALTER TABLE projects ADD COLUMN keep_image_history INTEGER DEFAULT 5;
```

### 3.4 Resource Limits

Add container resource constraints.

Update project settings:
- CPU limit (millicores)
- Memory limit (MB)
- Restart policy configuration

Apply in `deploymentService.js`:
```javascript
HostConfig: {
  Memory: project.memory_limit * 1024 * 1024,
  NanoCpus: project.cpu_limit * 1000000,
  // ...
}
```

Add resource usage graphs to Analytics tab.

### 3.5 Build Cache Optimization

Current: Builds from scratch every time.

Improvement:
- Use Docker build cache effectively
- Add `--cache-from` when building
- Optional: Local registry for layer caching

Configuration option per project: "Enable build cache"

### 3.6 Error Handling and Logging

Improvements needed:

- Structured logging with levels (debug, info, warn, error)
- Log rotation for build/runtime logs
- Better error messages in UI
- Error aggregation and patterns
- Export logs as downloadable file

Add `control-plane/services/logger.js`:
- Centralized logging
- Log levels
- Contextual logging (projectId, deploymentId)

### 3.7 Secrets Management

Current: Environment variables stored encrypted.

Enhancements:
- Mask secrets in logs
- Secret rotation without redeployment
- Import secrets from .env file
- Secret templates (common configs)
- Mark variables as "secret" vs "config"

Update UI to hide secret values by default with show/hide toggle.

### 3.8 Webhooks

Auto-deploy on GitHub push.

Implementation:
- Add webhook URL to projects: `/api/webhooks/:projectId/:token`
- Generate secure webhook tokens
- Verify GitHub webhook signatures
- Support branch filtering
- Enable/disable per project

UI: Show webhook URL, regenerate token button.

### 3.9 Multi-User Support

Current: Single user OAuth.

Future: Multiple users, teams, permissions.

Not immediate priority but plan database schema:

```sql
CREATE TABLE teams (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE team_members (
    team_id INTEGER REFERENCES teams(id),
    user_id INTEGER REFERENCES users(id),
    role VARCHAR(50), -- owner, admin, developer, viewer
    PRIMARY KEY (team_id, user_id)
);

ALTER TABLE projects ADD COLUMN team_id INTEGER REFERENCES teams(id);
```

### 3.10 Configuration File

Add `minipaas.config.js` or `.minipaasrc`:

```javascript
module.exports = {
  defaultPort: 3000,
  maxConcurrentBuilds: 2,
  volumeDefaultSize: 5 * 1024 * 1024 * 1024, // 5GB
  buildCacheEnabled: true,
  resourceLimits: {
    defaultMemoryMB: 512,
    defaultCPUMillicores: 1000
  },
  retention: {
    keepDeployments: 10,
    keepImages: 5,
    logRetentionDays: 30
  }
}
```

---

## 4. Implementation Priority

### Phase 1 (High Priority)
1. Landing page (2 hours)
2. Volume storage backend (4 hours)
3. Volume UI - basic file browser (3 hours)
4. Health monitoring (2 hours)

### Phase 2 (Medium Priority)
5. Build queue (3 hours)
6. Resource limits (2 hours)
7. Deployment rollback (2 hours)
8. Error handling improvements (3 hours)

### Phase 3 (Low Priority)
9. Webhooks (4 hours)
10. Build cache optimization (2 hours)
11. Configuration file (1 hour)
12. Secrets management improvements (2 hours)

---

## 5. Testing Checklist

For each feature:
- [ ] Manual testing with sample project
- [ ] Edge case handling (large files, network errors, etc.)
- [ ] Database migration tested
- [ ] UI responsive and functional
- [ ] Logs show expected information
- [ ] Documentation updated

---

## 6. Documentation Needs

Update README.md with:
- Volume storage usage guide
- Webhook setup instructions
- Resource limit configuration
- Build queue behavior
- Rollback procedure

---

End of plan.
