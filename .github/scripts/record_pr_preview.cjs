const { createClient } = require('@supabase/supabase-js');

const loggedRequestMetadata = new Set();

function assertEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
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
  'cloudflare-workers-and-pages',
  'cloudflare-pages',
  'cloudflare-pages[bot]',
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
  const maxRetries = Number(process.env.PREVIEW_MAX_RETRIES || 40);
  const delayMs = Number(process.env.PREVIEW_RETRY_DELAY_MS || 30000);
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

    console.log(`Preview URL not available yet. Waiting ${delayMs / 1000} seconds before next attempt...`);
    await delay(delayMs);
  }

  throw new Error('Timed out waiting for the Cloudflare Pages preview URL.');
}

async function main() {
  const GH_TOKEN = assertEnv('GH_TOKEN');
  const SUPABASE_URL = assertEnv('SUPABASE_URL');
  const SUPABASE_ANON_KEY = assertEnv('SUPABASE_ANON_KEY');
  const PR_NUMBER_RAW = assertEnv('PR_NUMBER');
  const PR_URL = assertEnv('PR_URL');
  const COMMIT_SHA = assertEnv('COMMIT_SHA');

  if (!process.env.GITHUB_REPOSITORY) {
    throw new Error('Missing GITHUB_REPOSITORY in environment.');
  }

  console.log(`Processing PR #${PR_NUMBER_RAW} (${PR_URL}) for commit ${COMMIT_SHA}`);

  const prNumber = parseInt(PR_NUMBER_RAW, 10);
  if (Number.isNaN(prNumber)) {
    throw new Error(`PR_NUMBER is not a valid integer: ${PR_NUMBER_RAW}`);
  }

  const previewUrl = await getPreviewUrl(prNumber, COMMIT_SHA);

  console.log('Updating Supabase with build record...');
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error } = await supabase.from('preview_builds').insert([
    {
      pr_number: prNumber,
      pr_url: PR_URL,
      commit_sha: COMMIT_SHA,
      preview_url: previewUrl,
      status: 'pending_review',
      is_seen: false,
      run_id: process.env.GITHUB_RUN_ID ? parseInt(process.env.GITHUB_RUN_ID, 10) : null,
      build_number: null,
    },
  ]);

  if (error) {
    throw new Error(`Supabase insert failed: ${error.message}`);
  }

  console.log('✅ Preview record stored successfully.');
}

main().catch((error) => {
  console.error('Failed to record preview for PR:', error);
  process.exit(1);
});

