AI memory: Supabase workflow for this project

Reads (live DB):
- Use Supabase REST or supabase-js with the publishable anon key.
- The app and scripts read from the hosted project at https://cvzgxnspmmxxxwnxiydk.supabase.co.

Writes (schema/data migrations):
- Use SQL files in supabase/migrations and apply with `supabase db push`.
- GitHub Action `.github/workflows/supabase-db-push.yml` auto-runs `supabase db push` on main when migrations change.
- Requires `supabase/config.toml` with project_id and repo secret SUPABASE_ACCESS_TOKEN (already configured locally; Action uses the secret).

Local CLI:
- `supabase login` stores a persistent token on the machine (not per shell).
- `supabase link --project-ref <ref>` writes supabase/config.toml (committed) so `db push` knows the project.

Ad hoc verification:
- Node script with supabase-js or curl to REST can fetch `graph_documents` (id='main') and inspect `data.nodes`.


