-- Update scheduled_start and scheduled_end for specific nodes in the JSONB document
-- Nodes: "call insurance" and "call doctors office"
-- Times: today 13:30-14:00 and 14:00-14:30 local time

-- Compute today's date string in the database server's timezone and construct ISO timestamps
DO $$
DECLARE
  tz TEXT := 'localtime'; -- rely on server local time; adjust if needed (e.g., 'UTC' or specific tz)
  today DATE := (now() AT TIME ZONE tz)::date;
  start1 TIMESTAMP := (today + TIME '13:30') AT TIME ZONE tz;
  end1   TIMESTAMP := (today + TIME '14:00') AT TIME ZONE tz;
  start2 TIMESTAMP := (today + TIME '14:00') AT TIME ZONE tz;
  end2   TIMESTAMP := (today + TIME '14:30') AT TIME ZONE tz;
  start1_iso TEXT := to_char(start1 AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS".000Z"');
  end1_iso   TEXT := to_char(end1   AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS".000Z"');
  start2_iso TEXT := to_char(start2 AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS".000Z"');
  end2_iso   TEXT := to_char(end2   AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS".000Z"');
BEGIN
  -- Update JSONB data for graph_documents id 'main'
  UPDATE public.graph_documents g
  SET data = (
    SELECT jsonb_set(
      jsonb_set(
        g.data,
        ARRAY['nodes', node_id1::text, 'scheduled_start'], to_jsonb(start1_iso)
      ),
      ARRAY['nodes', node_id1::text, 'scheduled_end'], to_jsonb(end1_iso)
    )
    FROM (
      SELECT
        -- Locate node ids by label
        (SELECT key FROM jsonb_each_text(g.data->'nodes') e(key, val)
         WHERE (g.data->'nodes'->key->>'label') ILIKE 'call insurance' LIMIT 1) AS node_id1,
        (SELECT key FROM jsonb_each_text(g.data->'nodes') e2(key, val)
         WHERE (g.data->'nodes'->key->>'label') ILIKE 'call doctors office' LIMIT 1) AS node_id2
    ) s
  )
  WHERE g.id = 'main';

  -- Second update to set the second node's schedule (jsonb_set returns a new doc each time)
  UPDATE public.graph_documents g
  SET data = (
    SELECT jsonb_set(
      jsonb_set(
        g.data,
        ARRAY['nodes', node_id2::text, 'scheduled_start'], to_jsonb(start2_iso)
      ),
      ARRAY['nodes', node_id2::text, 'scheduled_end'], to_jsonb(end2_iso)
    )
    FROM (
      SELECT
        (SELECT key FROM jsonb_each_text(g.data->'nodes') e(key, val)
         WHERE (g.data->'nodes'->key->>'label') ILIKE 'call insurance' LIMIT 1) AS node_id1,
        (SELECT key FROM jsonb_each_text(g.data->'nodes') e2(key, val)
         WHERE (g.data->'nodes'->key->>'label') ILIKE 'call doctors office' LIMIT 1) AS node_id2
    ) s
  )
  WHERE g.id = 'main';
END $$;
