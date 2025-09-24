const fs = require('fs');
const { exec } = require('child_process');
const chokidar = require('chokidar');

console.log('[remote-mcp] 🚀 Auto-sync process started...');
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

  console.log('📝 Auto-committing changes...');

  // First, clean up any potential problematic files
  exec('git clean -fd --dry-run', (cleanError, cleanOutput) => {
    if (cleanOutput && cleanOutput.includes('nul')) {
      exec('git clean -fd', () => console.log('🧹 Cleaned up problematic files'));
    }

    exec('git add --all', (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Error staging files:', error.message);
        if (stderr.includes('nul')) {
          console.log('🔧 Attempting to fix nul file issue...');
          exec('rm -f nul', () => {
            console.log('🗑️ Removed problematic nul file');
            pendingChanges = false;
          });
        }
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
              exec('git push --force origin master', (pushError, pushStdout, pushStderr) => {
                if (pushError) {
                  console.error('❌ Error pushing to GitHub:', pushError.message);
                  if (pushStderr.includes('error: src refspec')) {
                    console.log('ℹ️  It looks like the branch name differs locally. Skipping push until resolved.');
                  }
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
  });
}

function checkAndDeployDatabase(callback) {
  // Check if there are changes in the supabase/migrations folder
  exec('git diff HEAD~1 --name-only | grep "supabase/migrations"', (error, stdout) => {
    if (stdout.trim()) {
      console.log('🗄️ Database migrations detected, deploying to Supabase...');

      // Deploy database changes
      exec('npm run db:deploy', (dbError, dbStdout, dbStderr) => {
        if (dbError) {
          console.error('❌ Error deploying to Supabase:', dbError.message);
          if (dbStderr) console.error('DB Error details:', dbStderr);
        } else {
          console.log('✅ Database deployed to Supabase!');
          console.log('📝 Types regenerated!');
        }
        callback();
      });
    } else {
      // No database changes, proceed with GitHub push
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
