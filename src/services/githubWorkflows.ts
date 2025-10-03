const GITHUB_WORKFLOW_TOKEN = import.meta.env.VITE_GITHUB_WORKFLOW_TOKEN;
const GITHUB_REPOSITORY_OWNER = import.meta.env.VITE_GITHUB_OWNER;
const GITHUB_REPOSITORY_NAME = import.meta.env.VITE_GITHUB_REPO;
const GITHUB_MERGE_WORKFLOW_ID = import.meta.env.VITE_GITHUB_MERGE_WORKFLOW ?? 'merge_pr.yml';
const GITHUB_DEFAULT_BRANCH = import.meta.env.VITE_GITHUB_DEFAULT_BRANCH ?? 'main';

const buildMissingEnvError = (variable: string) =>
  new Error(`${variable} is not defined. Please add it to your Vite environment configuration.`);

export const triggerMergeWorkflow = async (prNumber: number): Promise<void> => {
  if (!GITHUB_WORKFLOW_TOKEN) {
    throw buildMissingEnvError('VITE_GITHUB_WORKFLOW_TOKEN');
  }
  if (!GITHUB_REPOSITORY_OWNER) {
    throw buildMissingEnvError('VITE_GITHUB_OWNER');
  }
  if (!GITHUB_REPOSITORY_NAME) {
    throw buildMissingEnvError('VITE_GITHUB_REPO');
  }

  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_REPOSITORY_OWNER}/${GITHUB_REPOSITORY_NAME}/actions/workflows/${GITHUB_MERGE_WORKFLOW_ID}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_WORKFLOW_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: GITHUB_DEFAULT_BRANCH,
        inputs: {
          pr_number: String(prNumber),
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to dispatch merge workflow for PR #${prNumber}: ${response.status} ${response.statusText} - ${errorText}`
    );
  }
};

export default triggerMergeWorkflow;
