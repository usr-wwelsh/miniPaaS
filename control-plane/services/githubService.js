const { Octokit } = require('@octokit/rest');
const simpleGit = require('simple-git');
const fs = require('fs-extra');
const path = require('path');

async function listRepositories(accessToken) {
  const octokit = new Octokit({ auth: accessToken });

  try {
    const { data } = await octokit.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 100
    });

    return data.map(repo => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      clone_url: repo.clone_url,
      default_branch: repo.default_branch,
      private: repo.private,
      description: repo.description
    }));
  } catch (error) {
    console.error('Error fetching repositories:', error);
    throw new Error('Failed to fetch repositories from GitHub');
  }
}

async function cloneRepository(repoUrl, branch, targetPath, accessToken) {
  try {
    await fs.ensureDir(targetPath);

    const urlWithAuth = repoUrl.replace('https://', `https://x-access-token:${accessToken}@`);

    const git = simpleGit();
    await git.clone(urlWithAuth, targetPath, ['--branch', branch, '--single-branch', '--depth', '1']);

    const commitInfo = await simpleGit(targetPath).log(['-1']);
    const commitSha = commitInfo.latest?.hash || 'unknown';

    return {
      success: true,
      commitSha,
      path: targetPath
    };
  } catch (error) {
    console.error('Error cloning repository:', error);
    throw new Error(`Failed to clone repository: ${error.message}`);
  }
}

async function getLatestCommit(repoFullName, branch, accessToken) {
  const octokit = new Octokit({ auth: accessToken });

  try {
    const [owner, repo] = repoFullName.split('/');
    const { data } = await octokit.repos.getCommit({
      owner,
      repo,
      ref: branch
    });

    return {
      sha: data.sha,
      message: data.commit.message,
      author: data.commit.author.name,
      date: data.commit.author.date
    };
  } catch (error) {
    console.error('Error fetching latest commit:', error);
    throw new Error('Failed to fetch latest commit');
  }
}

module.exports = {
  listRepositories,
  cloneRepository,
  getLatestCommit
};
