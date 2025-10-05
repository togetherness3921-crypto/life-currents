const { execSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

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

async function getPreviewUrl(commitSha) {
  const repo = process.env.GITHUB_REPOSITORY;
  const baseUrl = `https://api.github.com/repos/${repo}`;

  const fetchJson = async (url) => {
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
  };

  for (let i = 0; i < 20; i++) {
    console.log(`\n--- Deployment poll attempt ${i + 1}/20 ---`);
    const checkRunsUrl = `${baseUrl}/commits/${commitSha}/check-runs`;
    const { check_runs } = await fetchJson(checkRunsUrl);
    const cfCheck = check_runs.find((cr) => cr.app?.slug === 'cloudflare-pages');
    if (cfCheck) {
      console.log(`Cloudflare check status: ${cfCheck.status}, conclusion: ${cfCheck.conclusion || 'N/A'}`);
      if (cfCheck.conclusion && ['failure', 'cancelled', 'timed_out'].includes(cfCheck.conclusion)) {
        throw new Error(`Cloudflare deployment failed with conclusion '${cfCheck.conclusion}'. Check Cloudflare logs.`);
      }
    } else if (i > 3) {
      throw new Error('Cloudflare deployment not triggered. Check integration.');
    }

    const deploymentsUrl = `${baseUrl}/deployments?sha=${commitSha}`;
    const deployments = await fetchJson(deploymentsUrl);
    const previewDeployment = deployments.find((d) => d.environment === 'Preview');
    if (previewDeployment) {
      const statuses = await fetchJson(previewDeployment.statuses_url);
      const success = statuses.find((s) => s.state === 'success' && s.environment_url);
      if (success) {
        console.log(`Found preview URL: ${success.environment_url}`);
        return success.environment_url;
      }
    }

    console.log('Preview URL not ready. Retrying in 30 seconds...');
    await new Promise((resolve) => setTimeout(resolve, 30000));
  }

  throw new Error('Timed out waiting for Cloudflare preview URL.');
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
  const previewUrl = await getPreviewUrl(commitSha);

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
