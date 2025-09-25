-- Transform the graph_documents data structure to new nested format
UPDATE graph_documents 
SET data = jsonb_build_object(
  'active_node', data->>'active_node',
  'viewport', data->'viewport',
  'nodes', (
    SELECT jsonb_object_agg(
      key,
      CASE 
        WHEN key IN ('active_node', 'viewport', 'relationships') THEN NULL
        ELSE 
          -- Find parent from relationships array
          (SELECT jsonb_build_object(
            'type', value->>'type',
            'label', value->>'label', 
            'status', COALESCE(value->>'status', 'not-started'),
            'position', value->'position',
            'parent', (
              SELECT rel->>'from' 
              FROM jsonb_array_elements(data->'relationships') rel
              WHERE rel->>'to' = key
              LIMIT 1
            ),
            'graph', 'main'
          ))
      END
    ) FILTER (WHERE key NOT IN ('active_node', 'viewport', 'relationships'))
    FROM jsonb_each(data)
  )
)
WHERE id = 'main';