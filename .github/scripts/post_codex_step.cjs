const { execSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const loggedRequestMetadata = new Set();

function setActionOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    fs.appendFileSync(outputFile, `${name}=${String(value)}\n`);
  } else {
    console.log(`::set-output name=${name}::${value}`);
  }
}

async function fetchJson(url, options = {}) {
  const headers = {
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const requestKey = `${response.url}::${options.method || 'GET'}`;
  const requestId = response.headers.get('x-github-request-id');
  const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
  const rateLimitReset = response.headers.get('x-ratelimit-reset');
  const oauthScopes = response.headers.get('x-oauth-scopes');
  const linkHeader = response.headers.get('link');
  const resource = url.replace('https://api.github.com', '');

  if (!loggedRequestMetadata.has(requestKey)) {
    loggedRequestMetadata.add(requestKey);
    console.log(`[GitHub] ${options.method || 'GET'} ${resource} -> ${response.status}`);
    console.log(`         request-id=${requestId || 'unknown'} remaining=${rateLimitRemaining || 'unknown'} reset=${rateLimitReset || 'unknown'} scopes=${oauthScopes || 'unknown'}`);
    if (linkHeader) {
      console.log(`         pagination=${linkHeader}`);
    }
  }
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractPreviewUrl(text) {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s>\)]+/i);
  if (!match) return null;
  const cleaned = match[0].replace(/[)\]\s]*$/, '');
  return cleaned.includes('.pages.dev') ? cleaned : match[0];
}

const CLOUDFLARE_APP_IDENTIFIERS = [
  'cloudflare-workers-and-pages', // The modern slug for the GitHub App
  'cloudflare-pages',             // A potential legacy or alternative slug
  'cloudflare-pages[bot]',        // A username format for bot comments
];

async function tryCheckRunPreview(baseUrl, commitSha) {
  const checkRunsUrl = `${baseUrl}/commits/${commitSha}/check-runs`;
  const { check_runs: checkRuns = [] } = await fetchJson(checkRunsUrl);
  console.log(`Fetched ${checkRuns.length} check-runs for commit ${commitSha}.`);
  checkRuns.slice(0, 5).forEach((run) => {
    const appSlug = run.app?.slug || run.app?.name || 'unknown-app';
    console.log(`  • Check-run ${run.id} (${run.name}) from ${appSlug} status=${run.status} conclusion=${run.conclusion}`);
  });
  const cfCheckRun = checkRuns.find((run) => {
    const appSlug = run.app?.slug?.toLowerCase() || '';
    return CLOUDFLARE_APP_IDENTIFIERS.includes(appSlug);
  });

  if (!cfCheckRun) {
    console.log('No Cloudflare Pages check-run found yet.');
    return null;
  }

  console.log(`Cloudflare Pages check-run status: ${cfCheckRun.status}; conclusion: ${cfCheckRun.conclusion || 'pending'}`);

  if (cfCheckRun.status === 'completed' && cfCheckRun.conclusion && ['success', 'neutral'].includes(cfCheckRun.conclusion)) {
    const possibleSources = [
      cfCheckRun.output?.summary,
      cfCheckRun.output?.text,
      cfCheckRun.output?.title,
      cfCheckRun.details_url,
    ];

    for (const source of possibleSources) {
      const url = extractPreviewUrl(source);
      if (url) {
        console.log('Extracted preview URL from Cloudflare check-run.');
        return url;
      }
    }
  }

  return null;
}

async function tryStatusPreview(baseUrl, commitSha) {
  const statusesUrl = `${baseUrl}/commits/${commitSha}/statuses?per_page=100`;
  const statuses = await fetchJson(statusesUrl);
  console.log(`Fetched ${statuses.length} commit statuses for ${commitSha}.`);
  statuses.slice(0, 5).forEach((status) => {
    const context = status.context || 'unknown-context';
    const state = status.state || 'unknown-state';
    const creator = status.creator?.login || 'unknown-user';
    console.log(`  • Status ${status.id} context="${context}" state=${state} by ${creator}`);
  });

  const cfStatus = statuses.find((status) => {
    const context = (status.context || '').toLowerCase();
    return context.includes('cloudflare') || context.includes('pages');
  });

  if (!cfStatus) {
    console.log('No Cloudflare-like commit status found yet.');
    return null;
  }

  const possibleSources = [cfStatus.target_url, cfStatus.description, cfStatus.context];
  for (const source of possibleSources) {
    const url = extractPreviewUrl(source);
    if (url) {
      console.log('Extracted preview URL from commit status.');
      return url;
    }
  }

  console.log('Cloudflare-like status located but did not contain a preview URL.');
  return null;
}

async function tryCommentPreview(baseUrl, prNumber) {
  const commentsUrl = `${baseUrl}/issues/${prNumber}/comments?per_page=100`;
  const comments = await fetchJson(commentsUrl);
  console.log(`Fetched ${comments.length} issue comments for PR #${prNumber}.`);
  comments.slice(-5).forEach((comment) => {
    const login = comment.user?.login || 'unknown-user';
    console.log(`  • Comment ${comment.id} by ${login} at ${comment.created_at}`);
  });
  const cfComment = [...comments]
    .reverse()
    .find((comment) => {
      const login = comment.user?.login || '';
      return CLOUDFLARE_APP_IDENTIFIERS.includes(login.toLowerCase());
    });

  if (!cfComment) {
    console.log('Cloudflare deployment comment not found yet.');
    return null;
  }

  const url = extractPreviewUrl(cfComment.body);
  if (url) {
    console.log('Extracted preview URL from Cloudflare deployment comment.');
    return url;
  }

  console.log('Cloudflare comment located but did not contain a preview URL.');
  return null;
}

async function tryTimelinePreview(baseUrl, prNumber) {
  const timelineUrl = `${baseUrl}/issues/${prNumber}/timeline?per_page=100`;
  const events = await fetchJson(timelineUrl, {
    headers: {
      Accept: 'application/vnd.github.mockingbird-preview+json',
    },
  });
  console.log(`Fetched ${events.length} timeline events for PR #${prNumber}.`);

  const timelineComment = [...events]
    .reverse()
    .find((event) => {
      const login = event.actor?.login || '';
      const body = event.body || '';
      const isCloudflareActor = CLOUDFLARE_APP_IDENTIFIERS.includes(login.toLowerCase());
      return event.event === 'commented' && isCloudflareActor && extractPreviewUrl(body);
    });

  if (!timelineComment) {
    console.log('Cloudflare timeline event with preview URL not found yet.');
    return null;
  }

  const url = extractPreviewUrl(timelineComment.body);
  if (url) {
    console.log('Extracted preview URL from PR timeline event.');
      return url;
    }

  console.log('Cloudflare timeline event located but did not contain a preview URL.');
  return null;
}

async function tryReviewPreview(baseUrl, prNumber) {
  const reviewsUrl = `${baseUrl}/pulls/${prNumber}/reviews?per_page=100`;
  const reviews = await fetchJson(reviewsUrl);
  console.log(`Fetched ${reviews.length} pull request reviews for PR #${prNumber}.`);

  const cfReview = [...reviews]
    .reverse()
    .find((review) => {
      const login = review.user?.login || '';
      return CLOUDFLARE_APP_IDENTIFIERS.includes(login.toLowerCase()) && extractPreviewUrl(review.body);
    });

  if (cfReview) {
    const url = extractPreviewUrl(cfReview.body);
    if (url) {
      console.log('Extracted preview URL from PR review body.');
      return url;
    }
  }

  const reviewCommentsUrl = `${baseUrl}/pulls/${prNumber}/comments?per_page=100`;
  const reviewComments = await fetchJson(reviewCommentsUrl);
  console.log(`Fetched ${reviewComments.length} review comments for PR #${prNumber}.`);

  const cfReviewComment = [...reviewComments]
    .reverse()
    .find((comment) => {
      const login = comment.user?.login || '';
      return CLOUDFLARE_APP_IDENTIFIERS.includes(login.toLowerCase()) && extractPreviewUrl(comment.body);
    });

  if (cfReviewComment) {
    const url = extractPreviewUrl(cfReviewComment.body);
    if (url) {
      console.log('Extracted preview URL from review comment.');
      return url;
    }
  }

  console.log('Cloudflare review artifacts not found yet.');
  return null;
}

async function getPreviewUrl(prNumber, commitSha) {
  console.log(`\nPolling for Cloudflare preview URL for commit: ${commitSha}...`);
  const maxRetries = 40; // Try for up to 20 minutes (40 * 30s)
  const repo = process.env.GITHUB_REPOSITORY;
  const baseUrl = `https://api.github.com/repos/${repo}`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`\n--- Poll attempt ${attempt}/${maxRetries} ---`);

    try {
      const fromCheckRun = await tryCheckRunPreview(baseUrl, commitSha);
      if (fromCheckRun) {
        console.log(`\n✅ Success! Found preview URL via check-run: ${fromCheckRun}`);
        return fromCheckRun;
      }
    } catch (error) {
      console.log(`Check-run polling error: ${error.message}`);
    }

    try {
      const fromStatuses = await tryStatusPreview(baseUrl, commitSha);
      if (fromStatuses) {
        console.log(`\n✅ Success! Found preview URL via commit status: ${fromStatuses}`);
        return fromStatuses;
      }
    } catch (error) {
      console.log(`Status polling error: ${error.message}`);
    }

    try {
      const fromComments = await tryCommentPreview(baseUrl, prNumber);
      if (fromComments) {
        console.log(`\n✅ Success! Found preview URL via PR comment: ${fromComments}`);
        return fromComments;
      }
    } catch (error) {
      console.log(`Comment polling error: ${error.message}`);
    }

    try {
      const fromTimeline = await tryTimelinePreview(baseUrl, prNumber);
      if (fromTimeline) {
        console.log(`\n✅ Success! Found preview URL via PR timeline: ${fromTimeline}`);
        return fromTimeline;
      }
    } catch (error) {
      console.log(`Timeline polling error: ${error.message}`);
    }

    try {
      const fromReviews = await tryReviewPreview(baseUrl, prNumber);
      if (fromReviews) {
        console.log(`\n✅ Success! Found preview URL via PR review: ${fromReviews}`);
        return fromReviews;
      }
    } catch (error) {
      console.log(`Review polling error: ${error.message}`);
    }

    console.log('Preview URL not available yet. Waiting 30 seconds before next attempt...');
    await delay(30000);
  }

  throw new Error('Timed out waiting for the Cloudflare Pages preview URL.');
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
  setActionOutput('commit_sha', commitSha);

  const previewUrl = await getPreviewUrl(prNumber, commitSha);

  if (previewUrl) {
    setActionOutput('preview_url', previewUrl);
  }

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
