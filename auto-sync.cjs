const { exec } = require('child_process');
const chokidar = require('chokidar');

console.log('[ROOT] 🚀 Auto-Sync: Most Recent Changes Win');
let isSyncing = false;

// --- Sync Function: Most Recent Wins ---
function sync() {
  if (isSyncing) return;
  isSyncing = true;

  console.log('[ROOT] 🔄 Pulling remote changes (remote wins conflicts)...');
  exec('git pull --strategy-option=theirs origin main', (pullError) => {
    if (pullError && !pullError.message.includes('up to date')) {
      console.warn('[ROOT] ⚠️ Pull completed with warnings:', pullError.message);
    }

    console.log('[ROOT] 📝 Committing local changes...');
    exec('git add --all && git commit -m "Auto-sync" --quiet', (commitError) => {
      // Ignore "nothing to commit" errors

      console.log('[ROOT] 🚀 Pushing to GitHub...');
      exec('git push origin master:main', (pushError) => {
        if (pushError) {
          console.error('[ROOT] ❌ Push failed:', pushError.message);
        } else {
          console.log('[ROOT] ✅ Sync complete!');
        }
        isSyncing = false;
      });
    });
  });
}

// --- File Watcher ---
const watcher = chokidar.watch('.', {
  ignored: [/node_modules/, /\.git/, /remote-mcp-server-authless/, /synced_files/],
  ignoreInitial: true,
});

let syncTimeout;
watcher.on('all', (event, path) => {
  console.log(`[ROOT] 📝 Change: ${path}`);
  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(sync, 3000);
});

// --- Periodic Sync (every 15 seconds) ---
setInterval(sync, 15000);
console.log('[ROOT] Monitoring files and checking remote every 15s...');

process.on('SIGINT', () => {
  console.log('\n[ROOT] 👋 Stopped.');
  watcher.close();
  process.exit(0);
});