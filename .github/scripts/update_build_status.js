// .github/scripts/update_build_status.js

const { createClient } = require('@supabase/supabase-js');

async function main() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, PR_NUMBER } = process.env;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !PR_NUMBER) {
    throw new Error('Missing required environment variables for Supabase update.');
  }

  console.log(`Updating status for PR #${PR_NUMBER} to 'committed' in Supabase...`);
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data, error } = await supabase
    .from('preview_builds')
    .update({ status: 'committed' })
    .eq('pr_number', parseInt(PR_NUMBER, 10));

  if (error) {
    console.error('Error updating Supabase:', error);
    throw new Error(`Failed to update build status: ${error.message}`);
  }

  console.log(`Successfully updated status for PR #${PR_NUMBER}.`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
