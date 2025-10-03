const getEnv = (key: string, fallback?: string) => {
  const value = (import.meta.env as Record<string, string | undefined>)[key];
  if (value && value.length > 0) {
    return value;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  return '';
};

const DEFAULT_WORKFLOW_REF = 'main';

const owner = getEnv('VITE_GITHUB_REPO_OWNER');
const repo = getEnv('VITE_GITHUB_REPO_NAME');
const workflowFile = getEnv('VITE_GITHUB_MERGE_WORKFLOW_FILE', 'merge_pr.yml');
const token = getEnv('VITE_GITHUB_WORKFLOW_TOKEN');
const workflowRef = getEnv('VITE_GITHUB_WORKFLOW_REF', DEFAULT_WORKFLOW_REF);

export const triggerMergeWorkflow = async (prNumber: number) => {
  if (!owner || !repo) {
    throw new Error('GitHub repository owner/name environment variables are not configured.');
  }

  if (!token) {
    throw new Error('GitHub workflow token environment variable is not configured.');
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFile}/dispatches`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: workflowRef,
        inputs: {
          pr_number: prNumber.toString(),
        },
      }),
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Failed to dispatch merge workflow: ${response.status} ${message}`);
  }
};
