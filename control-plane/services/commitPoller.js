const db = require('../config/database');
const { decrypt } = require('../utils/encryption');
const { getLatestCommit } = require('./githubService');

class CommitPoller {
  constructor() {
    this.pollingInterval = null;
    this.isPolling = false;
  }

  start(intervalMs = 60000) {
    if (this.isPolling) {
      console.log('[Commit Poller] Already running');
      return;
    }

    console.log(`[Commit Poller] Starting with ${intervalMs}ms interval`);
    this.isPolling = true;

    this.checkAllProjects();

    this.pollingInterval = setInterval(() => {
      this.checkAllProjects();
    }, intervalMs);
  }

  stop() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      this.isPolling = false;
      console.log('[Commit Poller] Stopped');
    }
  }

  async checkAllProjects() {
    try {
      const projects = await db.query(
        `SELECT id, github_repo_name, github_branch, github_access_token, latest_commit_sha
         FROM projects
         WHERE github_repo_name IS NOT NULL`
      );

      for (const project of projects.rows) {
        try {
          await this.checkProjectCommits(project);
        } catch (error) {
          console.error(`[Commit Poller] Error checking project ${project.id}:`, error.message);
        }
      }
    } catch (error) {
      console.error('[Commit Poller] Error fetching projects:', error);
    }
  }

  async checkProjectCommits(project) {
    try {
      const accessToken = decrypt(project.github_access_token);
      const latestCommit = await getLatestCommit(
        project.github_repo_name,
        project.github_branch,
        accessToken
      );

      const hasNewCommit = project.latest_commit_sha &&
                          project.latest_commit_sha !== latestCommit.sha;

      await db.query(
        `UPDATE projects
         SET latest_commit_sha = $1,
             latest_commit_message = $2,
             latest_commit_author = $3,
             latest_commit_date = $4,
             last_commit_check = NOW()
         WHERE id = $5`,
        [
          latestCommit.sha,
          latestCommit.message,
          latestCommit.author,
          latestCommit.date,
          project.id
        ]
      );

      if (hasNewCommit) {
        console.log(`[Commit Poller] New commit detected for project ${project.id}: ${latestCommit.sha.substring(0, 7)}`);
      }

      return {
        hasNewCommit,
        latestCommit
      };
    } catch (error) {
      console.error(`[Commit Poller] Failed to check commits for project ${project.id}:`, error.message);
      throw error;
    }
  }
}

const commitPoller = new CommitPoller();

module.exports = commitPoller;
