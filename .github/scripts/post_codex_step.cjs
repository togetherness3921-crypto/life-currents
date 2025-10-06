const { execSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${text}`);
  }
  return response.json();
}

function run(command, opts = {}) {
  const { ignoreError = false } = opts;
  console.log(`\n[RUNNING]: ${command}`);
  try {
    const output = execSync(command, { stdio: 'pipe', env: process.env }).toString();
    const trimmed = output.trim();
    console.log(trimmed);
    return trimmed;
  } catch (error) {
    console.error(`[ERROR]: ${command}`);
    if (error.stdout) console.error(`[STDOUT]: ${error.stdout.toString()}`);
    if (error.stderr) console.error(`[STDERR]: ${error.stderr.toString()}`);
    if (ignoreError) {
      return '';
    }
    throw error;
  }
}

async function getPreviewUrl(branchName, commitSha) {
  console.log(`\nPolling for Cloudflare preview URL for commit: ${commitSha}...`);
  const maxRetries = 20; // Try for up to 10 minutes (20 * 30s)
  const repo = process.env.GITHUB_REPOSITORY;
  const baseUrl = `https://api.github.com/repos/${repo}`;
  let cfDeployment = null;

  // Stage 1: Poll until a Cloudflare Pages deployment object exists for this commit.
  console.log('\n--- Stage 1: Waiting for deployment to be created ---');
  for (let i = 0; i < maxRetries; i++) {
    console.log(`Attempt ${i + 1}/${maxRetries}: Checking for deployment object...`);
    const deploymentsUrl = `${baseUrl}/deployments?sha=${commitSha}`;
    const deployments = await fetchJson(deploymentsUrl);

    cfDeployment = deployments.find((d) => d.environment === 'Preview' && d.creator?.login === 'cloudflare-pages');

    if (cfDeployment) {
      console.log(`Found Cloudflare Pages deployment object (ID: ${cfDeployment.id}). Proceeding to Stage 2.`);
      break;
    }

    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
  }

  if (!cfDeployment) {
    throw new Error('Timed out waiting for a Cloudflare Pages deployment to be created on this commit.');
  }

  // Stage 2: Poll the specific deployment's statuses until it succeeds.
  console.log('\n--- Stage 2: Waiting for deployment to report success ---');
  for (let i = 0; i < maxRetries; i++) {
    console.log(`Attempt ${i + 1}/${maxRetries}: Checking deployment status...`);
    const statuses = await fetchJson(cfDeployment.statuses_url);
    const successStatus = statuses.find((s) => s.state === 'success' && (s.environment_url || s.target_url));

    if (successStatus) {
      const url = successStatus.environment_url || successStatus.target_url;
      console.log(`\n✅ Success! Found preview URL: ${url}`);
      return url;
    }

    // Check for a hard failure state to fail fast.
    const failureStatus = statuses.find((s) => ['failure', 'error'].includes(s.state));
    if (failureStatus) {
      throw new Error(`Cloudflare deployment failed with state '${failureStatus.state}'. Check Cloudflare logs.`);
    }

    await new Promise(resolve => setTimeout(resolve, 30000));
  }

  throw new Error('Timed out waiting for the Cloudflare deployment to succeed.');
}

async function main() {
  const {
    INSTANCE_NUMBER,
    GH_TOKEN,
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    CODEX_OUTPUT,
  } = process.env;

  if (!INSTANCE_NUMBER || !GH_TOKEN || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Missing required environment variables in post_codex_step.cjs');
  }

  run(`git config user.name "Codex Agent"`);
  run(`git config user.email "codex-agent@users.noreply.github.com"`);
  run('git fetch origin main');

  const date = new Date().toISOString().split('T')[0];
  const branchSuffix = Math.random().toString(36).slice(2, 8);
  const branchName = `codex-build-${date}-instance-${INSTANCE_NUMBER}-${branchSuffix}`;
  run(`git checkout -b ${branchName}`);

  const gitStatus = run('git status --porcelain');
  if (!gitStatus) {
    console.log('No changes detected after Codex run. Exiting.');
    return;
  }

  run('git add .');
  run(`git commit -m "feat: Codex changes (Instance ${INSTANCE_NUMBER})"`);
  run(`git push origin ${branchName}`);

  const prTitle = `Codex Build (Instance ${INSTANCE_NUMBER})`;
  const prBody = CODEX_OUTPUT
    ? `Automated Codex run output:\n\n${CODEX_OUTPUT}`
    : 'Automated Codex run';

  const prBodyPath = path.join(process.cwd(), `codex-pr-body-${branchSuffix}.md`);
  fs.writeFileSync(prBodyPath, prBody, 'utf8');

  const prCommand = `gh pr create --repo ${process.env.GITHUB_REPOSITORY} --base main --head ${branchName} --title "${prTitle}" --body-file "${prBodyPath}"`;
  const prResult = run(prCommand);

  fs.unlinkSync(prBodyPath);

  const prUrlMatch = prResult.match(/https?:\/\/\S+/);
  if (!prUrlMatch) {
    throw new Error('Could not parse PR URL from gh output.');
  }
  const prUrl = prUrlMatch[0];
  const prNumber = prUrl.split('/').pop();
  console.log(`Created PR #${prNumber} at ${prUrl}`);

  const commitSha = run('git rev-parse HEAD');
  console.log(`::set-output name=commit_sha::${commitSha}`);
  const previewUrl = await getPreviewUrl(branchName, commitSha);

  console.log('Updating Supabase with build record...');
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error } = await supabase.from('preview_builds').insert([
    {
      pr_number: parseInt(prNumber, 10),
      pr_url: prUrl,
      commit_sha: commitSha,
      preview_url: previewUrl,
      status: 'pending_review',
      is_seen: false,
    },
  ]);

  if (error) {
    throw new Error(`Supabase insert failed: ${error.message}`);
  }

  console.log('✅ Post Codex step complete.');
}

main().catch((error) => {
  console.error('Post Codex step failed:', error);
  process.exit(1);
});
