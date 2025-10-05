// .github/scripts/run_codex_instance.cjs

const { execSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const HOME_DIR = process.env.HOME || process.env.USERPROFILE;
const CODEX_CONFIG_PATH = path.join(HOME_DIR, '.codex', 'config.toml');
const CODEX_CONFIG_CONTENT = `preferred_auth_method = "apikey"
approval_policy = "never"
sandbox_mode = "workspace-write"
instructions = "You are running in a fully automated CI/CD environment. Complete all tasks autonomously without requesting user approval. Run all programmatic checks specified in AGENTS.md files. Validate your work before yielding control."
`;

// A helper function to run shell commands and log their output.
// Throws an error if the command fails.
function runCommand(command, opts = {}) {
  const { ignoreError = false } = opts;
  console.log(`\n[RUNNING]: ${command}`);
  try {
    const output = execSync(command, {
      stdio: 'pipe',
      env: {
        ...process.env,
        RUST_LOG: 'trace',
        RUST_BACKTRACE: '1',
      },
    }).toString();
    const trimmed = output.trim();
    console.log(`[OUTPUT]: ${trimmed}`);
    return ignoreError ? { output: trimmed, status: 0 } : trimmed;
  } catch (error) {
    console.error(`[ERROR]: Command failed: ${command}`);
    if (ignoreError) {
      return {
        output: error.stdout ? error.stdout.toString().trim() : '',
        stderr: error.stderr ? error.stderr.toString().trim() : '',
        status: error.status ?? null,
      };
    }
    if (error.stdout) console.error(`[STDOUT]: ${error.stdout.toString()}`);
    if (error.stderr) console.error(`[STDERR]: ${error.stderr.toString()}`);
    if (error.status) console.error(`[EXIT CODE]: ${error.status}`);
    throw error;
  }
}

function writeCodexConfig() {
  const configDir = path.dirname(CODEX_CONFIG_PATH);
  // Ensure the directory exists before writing
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFileSync(CODEX_CONFIG_PATH, CODEX_CONFIG_CONTENT, 'utf8');
  console.log(`[INFO]: Updated ${CODEX_CONFIG_PATH}`);
}

// A helper function to call the GitHub REST API with the runner's token.
async function githubFetch(url) {
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${process.env.GH_TOKEN}`,
      'Accept': 'application/vnd.github+json'
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API request failed (${response.status} ${response.statusText}): ${text}`);
  }
  return response.json();
}

// A helper function to poll for the Cloudflare URL.
async function getPreviewUrl(commitSha) {
  console.log(`\nPolling for Cloudflare preview URL for commit: ${commitSha}...`);
  const maxRetries = 20; // Try for up to 10 minutes (20 * 30s)
  const repo = process.env.GITHUB_REPOSITORY;
  const baseUrl = `https://api.github.com/repos/${repo}`;

  for (let i = 0; i < maxRetries; i++) {
    console.log(`\n--- Poll attempt ${i + 1}/${maxRetries} ---`);
    try {
      // --- GitHub-Side Diagnostic: Check for a Cloudflare status check ---
      const checkRunsUrl = `${baseUrl}/commits/${commitSha}/check-runs`;
      const { check_runs } = await githubFetch(checkRunsUrl);
      const cfCheckRun = check_runs.find(cr => cr.app.slug === 'cloudflare-pages');

      if (cfCheckRun) {
        console.log(`Found 'Cloudflare Pages' check-run (Status: ${cfCheckRun.status}, Conclusion: ${cfCheckRun.conclusion || 'N/A'})`);
        // Fail fast if the deployment has already failed on GitHub's side.
        if (cfCheckRun.conclusion && ['failure', 'cancelled', 'skipped', 'timed_out'].includes(cfCheckRun.conclusion)) {
          throw new Error(`Error: Cloudflare Pages deployment failed with conclusion '${cfCheckRun.conclusion}'. Check Cloudflare build logs for details.`);
        }
      } else if (i > 3) { // After 2 minutes (4 attempts * 30s), if we've seen nothing, fail.
        throw new Error("Error: Cloudflare Pages deployment was not triggered for this commit. Check the GitHub App integration and repository permissions.");
      }

      // --- Main Logic: Check for a successful deployment URL ---
      const deploymentsUrl = `${baseUrl}/deployments?sha=${commitSha}`;
      const deployments = await githubFetch(deploymentsUrl);
      const cfDeployment = deployments.find(d => d.environment === 'Preview');

      if (cfDeployment) {
        const statuses = await githubFetch(cfDeployment.statuses_url);
        const successStatus = statuses.find(s => s.state === 'success' && s.environment_url);
        if (successStatus) {
          console.log(`\n✅ Success! Found preview URL: ${successStatus.environment_url}`);
          return successStatus.environment_url;
        }
      }
    } catch (error) {
      // If it's one of our specific diagnostic errors, re-throw it to stop the process immediately.
      if (error.message.startsWith('Error:')) {
        throw error;
      }
      // Otherwise, it might be a transient network error, so we log it and continue polling.
      console.log(`Polling error on attempt ${i + 1}: ${error.message}`);
    }

    console.log(`Deployment not ready yet. Retrying in 30 seconds...`);
    await new Promise(resolve => setTimeout(resolve, 30000));
  }

  throw new Error('Timed out waiting for Cloudflare preview URL. The deployment may have stalled or failed in Cloudflare.');
}

async function main() {
  const {
    CODEX_PROMPT,
    INSTANCE_NUMBER,
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    GH_TOKEN,
    OPENAI_API_KEY, // Explicitly pull this for the check
  } = process.env;

  // --- 0. Pre-flight Checks ---
  console.log('--- Starting Workflow ---');
  if (!CODEX_PROMPT || !GH_TOKEN || !SUPABASE_URL || !SUPABASE_ANON_KEY || !OPENAI_API_KEY) {
    throw new Error('One or more required environment variables are missing.');
  }
  console.log(`OPENAI_API_KEY found with length: ${OPENAI_API_KEY.length}`);


  // --- 1. Git Setup ---
  runCommand(`git config user.name "Codex Agent"`);
  runCommand(`git config user.email "codex-agent@users.noreply.github.com"`);

  const date = new Date().toISOString().split('T')[0];
  const uniqueSuffix = Math.random().toString(36).slice(2, 8);
  const branchName = `codex-build-${date}-instance-${INSTANCE_NUMBER}-${uniqueSuffix}`;
  runCommand(`git checkout -b ${branchName}`);
  console.log(`\nCreated new branch: ${branchName}`);

  // --- 2. Codex Configuration ---
  console.log(`
Configuring Codex CLI to use API key authentication...`);
  writeCodexConfig();
  runCommand(`cat ${CODEX_CONFIG_PATH}`);
  runCommand('bash -lc \'codex login --api-key "$OPENAI_API_KEY"\'');

  // --- 3. Codex Health Check ---
  console.log(`\nRunning Codex health check...`);
  runCommand(`codex --version`);

  // --- 4. Run Codex ---
  console.log(`\nRunning Codex with prompt...`);
  const model = process.env.CODEX_MODEL || 'gpt-5-codex';
  const codexCommand = `codex exec --ask-for-approval never --skip-git-repo-check --config tools.web_search=true --model ${model} "${CODEX_PROMPT}"`;
  const execResult = runCommand(codexCommand, { ignoreError: true });

  if (execResult.status !== 0 && execResult.status !== 2) {
    console.error(`\nCodex exec exited with status ${execResult.status}. Skipping further steps.`);
    if (execResult.stderr) {
      console.error(execResult.stderr);
    }
    if (execResult.output) {
      console.error(execResult.output);
    }
    return;
  }

  if (execResult.status === 2) {
    console.warn('\nCodex exec completed with warnings (exit code 2). Continuing if changes are present.');
    if (execResult.stderr) {
      console.warn(execResult.stderr);
    }
    if (execResult.output) {
      console.warn(execResult.output);
    }
  }

  // --- 5. Check for Changes ---
  const status = runCommand('git status --porcelain');
  if (!status) {
    console.log('\nCodex made no changes. Exiting gracefully.');
    return;
  }
  console.log('\nCodex made changes. Proceeding to commit.');

  // --- 6. Commit and Push ---
  runCommand('git add .');
  runCommand(`git commit -m "feat: Implement changes from prompt (Instance ${INSTANCE_NUMBER})"`);
  runCommand(`git push origin ${branchName}`);

  // --- 7. Create Pull Request ---
  const prTitle = `Codex Build (Instance ${INSTANCE_NUMBER}): ${CODEX_PROMPT.substring(0, 50)}...`;
  const prBody = `This PR was automatically generated by the Codex Engine (Instance ${INSTANCE_NUMBER}) based on the following prompt:\n\n---\n\n> ${CODEX_PROMPT}`;
  const prResult = runCommand(`gh pr create --title "${prTitle}" --body "${prBody}" --fill`);

  const prUrl = prResult.match(/https?:\/\/\S+/)[0];
  const prNumber = prUrl.split('/').pop();
  console.log(`\nCreated PR #${prNumber} at: ${prUrl}`);

  const commitSha = runCommand(`git rev-parse HEAD`);

  // --- 8. Get Cloudflare URL ---
  const previewUrl = await getPreviewUrl(commitSha);

  // --- 9. Update Supabase ---
  console.log(`\nUpdating Supabase with build details...`);
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase
    .from('preview_builds')
    .insert([{
      pr_number: parseInt(prNumber, 10),
      pr_url: prUrl,
      commit_sha: commitSha,
      preview_url: previewUrl,
      status: 'pending_review',
      is_seen: false,
    }]);

  if (error) {
    console.error('Error updating Supabase:', error);
    throw new Error(`Failed to insert build record into Supabase: ${error.message}`);
  }

  console.log('\n🚀 Workflow complete! Build record saved to Supabase.');
}

// Run the main function and exit with a non-zero code on error.
main().catch(error => {
  console.error('\n--- Workflow Failed ---');
  // Log the full error object, not just the message
  console.error(error);
  process.exit(1);
});
