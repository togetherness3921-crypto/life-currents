const GITHUB_TOKEN = import.meta.env.VITE_GITHUB_TOKEN;
const GITHUB_REPO_OWNER = import.meta.env.VITE_GITHUB_REPO_OWNER;
const GITHUB_REPO_NAME = import.meta.env.VITE_GITHUB_REPO_NAME;
const GITHUB_MERGE_WORKFLOW = import.meta.env.VITE_GITHUB_MERGE_WORKFLOW ?? 'merge_pr.yml';
const GITHUB_DEFAULT_BRANCH = import.meta.env.VITE_GITHUB_DEFAULT_BRANCH ?? 'main';

const REQUIRED_ENV_ERROR = 'Missing GitHub configuration. Please set the VITE_GITHUB_TOKEN, VITE_GITHUB_REPO_OWNER, and VITE_GITHUB_REPO_NAME environment variables.';

export async function dispatchMergeWorkflow(prNumber: number) {
  if (!GITHUB_TOKEN || !GITHUB_REPO_OWNER || !GITHUB_REPO_NAME) {
    throw new Error(REQUIRED_ENV_ERROR);
  }

  const endpoint = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/actions/workflows/${GITHUB_MERGE_WORKFLOW}/dispatches`;
  console.debug('[dispatchMergeWorkflow] Dispatching merge workflow', {
    endpoint,
    prNumber,
    ref: GITHUB_DEFAULT_BRANCH,
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
    },
    body: JSON.stringify({
      ref: GITHUB_DEFAULT_BRANCH,
      inputs: {
        pr_number: String(prNumber),
      },
    }),
  });

  console.debug('[dispatchMergeWorkflow] Response received', {
    status: response.status,
    statusText: response.statusText,
  });

  if (!response.ok) {
    let message = `status ${response.status}`;
    try {
      const data = await response.json();
      if (data && typeof data.message === 'string') {
        message = data.message;
      }
      console.error('[dispatchMergeWorkflow] Error response body', data);
    } catch (error) {
      console.error('[dispatchMergeWorkflow] Failed to parse error response JSON', error);
    }
    throw new Error(`GitHub workflow dispatch failed: ${message}`);
  }
}
