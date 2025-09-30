const fs = require('fs');
const { exec } = require('child_process');
const chokidar = require('chokidar');

console.log('[life-currents] 🚀 Auto-sync process started...');
console.log('💡 Tip: Press Ctrl+C to stop auto-sync');

// Ignore node_modules, .git, and other unnecessary directories
const watcher = chokidar.watch('.', {
  ignored: [
    // Core ignores
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',

    // COMPLETE GIT ISOLATION - multiple patterns for Windows compatibility
    '**/.git',
    '**/.git/**',
    '.git',
    '.git/**',
    /\.git/,

    // COMPLETE SUB-PROJECT ISOLATION - multiple patterns for Windows compatibility  
    'remote-mcp-server-authless',
    'remote-mcp-server-authless/**',
    '**/remote-mcp-server-authless/**',
    /remote-mcp-server-authless/,

    // Auto-sync files
    'auto-sync.cjs',
    'auto-sync.js',
    'start-auto-sync.bat',
    'sync-all.cjs',

    // Other files to ignore
    '**/*.log',
    '**/*.tmp',
    '**/.DS_Store',
    '**/Thumbs.db',
    '**/.env*'
  ],
  ignoreInitial: true,
  persistent: true,
  usePolling: false,
  atomic: false,  // Disable atomic to reduce .git interference
  awaitWriteFinish: {
    stabilityThreshold: 100,
    pollInterval: 10
  }
});

let timeoutId;
let pendingChanges = false;
let isSyncing = false; // Prevents overlapping operations

function autoCommitAndPush() {
  if (!pendingChanges || isSyncing) return;
  isSyncing = true;

  pullRemoteChanges(() => {
    proceedToCommitAndPush();
  });
}

function pullRemoteChanges(callback) {
  exec('git fetch origin', (fetchError) => {
    if (fetchError) {
      console.error('[ROOT] ❌ Error fetching from remote:', fetchError.message);
      if (callback) {
        isSyncing = false;
        callback(fetchError);
      }
      return;
    }

    exec('git status -uno', (statusError, statusStdout) => {
      if (statusError) {
        console.error('[ROOT] ❌ Error getting git status:', statusError.message);
        if (callback) {
          isSyncing = false;
          callback(statusError);
        }
        return;
      }

      if (statusStdout.includes('Your branch is behind')) {
        console.log('[ROOT] 🌍 Remote is ahead. Pulling changes...');
        exec('git pull --rebase origin main', (pullError) => {
          if (pullError) {
            console.error('[ROOT] ❌ Error pulling changes:', pullError.message);
          } else {
            console.log('[ROOT] ✅ Successfully pulled remote changes.');
          }
          if (callback) {
            isSyncing = false;
            callback(pullError);
          }
        });
      } else {
        if (callback) {
          callback(null); // No error, proceed
        }
      }
    });
  });
}

function proceedToCommitAndPush() {
  console.log('[ROOT] 📝 Auto-committing changes...');

  exec('git add --all', (error) => {
    if (error) {
      console.error('[ROOT] ❌ Error staging files:', error.message);
      isSyncing = false;
      pendingChanges = false;
      return;
    }

    exec('git diff --cached --quiet', (diffError) => {
      if (diffError) {
        const timestamp = new Date().toLocaleString();
        const commitMessage = `Auto-sync: ${timestamp}`;

        exec(`git commit -m "${commitMessage}"`, (commitError) => {
          if (commitError) {
            console.error('[ROOT] ❌ Error committing:', commitError.message);
            isSyncing = false;
            pendingChanges = false;
            return;
          }

          console.log(`[ROOT] ✅ Committed: ${commitMessage}`);

          checkAndDeployDatabase(() => {
            exec('git push origin master:main', (pushError) => { // FIX: Pushing local 'master' to remote 'main'
              if (pushError) {
                console.error('[ROOT] ❌ Error pushing to GitHub:', pushError.message);
              } else {
                console.log('[ROOT] 🌟 Successfully pushed to GitHub!');
              }
              isSyncing = false;
              pendingChanges = false;
            });
          });
        });
      } else {
        console.log('[ROOT] 📄 No changes to commit');
        isSyncing = false;
        pendingChanges = false;
      }
    });
  });
}

function checkAndDeployDatabase(callback) {
  exec('git diff HEAD~1 --name-only | grep "supabase/migrations"', (error, stdout) => {
    if (stdout && stdout.trim()) {
      console.log('🗄️ Database migrations detected, deploying to Supabase...');
      exec('npm run db:push', (dbError, dbStdout, dbStderr) => {
        if (dbError) {
          console.error('❌ Error deploying to Supabase:', dbError.message);
          if (dbStderr) console.error('DB Error details:', dbStderr);
        } else {
          console.log('✅ Database deployed to Supabase!');
        }
        callback();
      });
    } else {
      callback();
    }
  });
}

// Debounce function to avoid too many commits
function scheduleCommit() {
  pendingChanges = true;

  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  // Wait 3 seconds after last change before committing
  timeoutId = setTimeout(autoCommitAndPush, 3000);
  console.log('⏱️  Changes detected, will auto-commit in 3 seconds...');
}

// Watch for file changes
watcher
  .on('add', (path) => {
    console.log(`📁 File added: ${path}`);
    scheduleCommit();
  })
  .on('change', (path) => {
    console.log(`📝 File changed: ${path}`);
    scheduleCommit();
  })
  .on('unlink', (path) => {
    console.log(`🗑️  File deleted: ${path}`);
    scheduleCommit();
  });

// Periodic remote check
setInterval(() => {
  if (!isSyncing) {
    console.log('[ROOT] 定时检查远程更新...'); // Timed check for remote updates...
    pullRemoteChanges();
  }
}, 15000); // Check every 15 seconds

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Auto-sync stopped. Your changes are safe!');
  watcher.close();
  process.exit(0);
});
