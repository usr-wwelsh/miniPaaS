-- miniPaaS Database Schema
-- PostgreSQL 15+

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    github_id INTEGER UNIQUE,
    github_username VARCHAR(255),
    github_access_token TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    subdomain VARCHAR(255) UNIQUE NOT NULL,
    github_repo_url TEXT NOT NULL,
    github_repo_name VARCHAR(255),
    github_branch VARCHAR(255) DEFAULT 'main',
    github_access_token TEXT,
    port INTEGER DEFAULT 3000,
    memory_limit INTEGER DEFAULT 512,
    cpu_limit INTEGER DEFAULT 1000,
    keep_image_history INTEGER DEFAULT 5,
    build_cache_enabled BOOLEAN DEFAULT true,
    webhook_token VARCHAR(255),
    webhook_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Deployments table
CREATE TABLE IF NOT EXISTS deployments (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    commit_sha VARCHAR(40),
    status VARCHAR(50) DEFAULT 'pending',
    docker_image_id VARCHAR(255),
    docker_container_id VARCHAR(255),
    can_rollback BOOLEAN DEFAULT true,
    queue_position INTEGER,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deployments_project ON deployments(project_id);
CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);

-- Environment variables table
CREATE TABLE IF NOT EXISTS env_vars (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    key VARCHAR(255) NOT NULL,
    value TEXT NOT NULL,
    is_suggested BOOLEAN DEFAULT FALSE,
    is_secret BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(project_id, key)
);

CREATE INDEX IF NOT EXISTS idx_env_vars_project ON env_vars(project_id);

-- Build logs table
CREATE TABLE IF NOT EXISTS build_logs (
    id SERIAL PRIMARY KEY,
    deployment_id INTEGER REFERENCES deployments(id) ON DELETE CASCADE,
    log_line TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_build_logs_deployment ON build_logs(deployment_id, timestamp);

-- Runtime logs table
CREATE TABLE IF NOT EXISTS runtime_logs (
    id SERIAL PRIMARY KEY,
    deployment_id INTEGER REFERENCES deployments(id) ON DELETE CASCADE,
    log_line TEXT NOT NULL,
    log_level VARCHAR(20) DEFAULT 'info',
    timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_runtime_logs_deployment ON runtime_logs(deployment_id, timestamp);

-- Analytics events table
CREATE TABLE IF NOT EXISTS analytics_events (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    data JSONB NOT NULL,
    timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_project_time ON analytics_events(project_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_data ON analytics_events USING GIN(data);

-- Volumes table
CREATE TABLE IF NOT EXISTS volumes (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    mount_path VARCHAR(255) NOT NULL DEFAULT '/app/storage',
    size_bytes BIGINT DEFAULT 0,
    max_size_bytes BIGINT DEFAULT 5368709120,
    docker_volume_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(project_id, name)
);

CREATE INDEX IF NOT EXISTS idx_volumes_project ON volumes(project_id);

-- Volume files table
CREATE TABLE IF NOT EXISTS volume_files (
    id SERIAL PRIMARY KEY,
    volume_id INTEGER REFERENCES volumes(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(255),
    uploaded_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(volume_id, file_path)
);

CREATE INDEX IF NOT EXISTS idx_volume_files_volume ON volume_files(volume_id);

-- Webhooks table
CREATE TABLE IF NOT EXISTS webhooks (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_project ON webhooks(project_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_processed ON webhooks(processed);

-- Teams table (for future multi-user support)
CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Team members table
CREATE TABLE IF NOT EXISTS team_members (
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50),
    PRIMARY KEY (team_id, user_id)
);

-- Create default admin user (for single-user setup)
INSERT INTO users (github_id, github_username, github_access_token)
VALUES (0, 'admin', 'placeholder')
ON CONFLICT (github_id) DO NOTHING;
