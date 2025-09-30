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

function autoCommitAndPush() {
  if (!pendingChanges) return;

  console.log('🔄 Checking for remote updates...');
  exec('git fetch origin', (fetchError) => {
    if (fetchError) {
      console.error('❌ Error fetching from remote:', fetchError.message);
      pendingChanges = false;
      return;
    }

    exec('git status -uno', (statusError, statusStdout) => {
      if (statusError) {
        console.error('❌ Error getting git status:', statusError.message);
        pendingChanges = false;
        return;
      }

      if (statusStdout.includes('Your branch is behind')) {
        console.log('🌍 Remote is ahead. Pulling changes...');
        exec('git pull --rebase origin main', (pullError) => {
          if (pullError) {
            console.error('❌ Error pulling changes:', pullError.message);
            console.log('❗️ Please resolve any conflicts manually.');
            pendingChanges = false;
            return;
          }
          console.log('✅ Successfully pulled remote changes.');
          proceedToCommitAndPush();
        });
      } else {
        console.log('👍 Local is up-to-date. Proceeding with commit...');
        proceedToCommitAndPush();
      }
    });
  });
}

function proceedToCommitAndPush() {
  console.log('📝 Auto-committing changes...');

  exec('git add --all', (error) => {
    if (error) {
      console.error('❌ Error staging files:', error.message);
      pendingChanges = false;
      return;
    }

    exec('git diff --cached --quiet', (diffError) => {
      if (diffError) {
        const timestamp = new Date().toLocaleString();
        const commitMessage = `Auto-sync: ${timestamp}`;

        exec(`git commit -m "${commitMessage}"`, (commitError) => {
          if (commitError) {
            console.error('❌ Error committing:', commitError.message);
            pendingChanges = false;
            return;
          }

          console.log(`✅ Committed: ${commitMessage}`);

          checkAndDeployDatabase(() => {
            exec('git push origin main', (pushError) => {
              if (pushError) {
                console.error('❌ Error pushing to GitHub:', pushError.message);
                pendingChanges = false;
                return;
              }
              console.log('🌟 Successfully pushed to GitHub!');
              pendingChanges = false;
            });
          });
        });
      } else {
        console.log('📄 No changes to commit');
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

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Auto-sync stopped. Your changes are safe!');
  watcher.close();
  process.exit(0);
});
