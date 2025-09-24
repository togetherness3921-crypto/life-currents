-- Insert a new node "Take a Shower" between
-- "complete_front_back_end_ui" and "stine_project_completed"

WITH current AS (
  SELECT data FROM graph_documents WHERE id = 'main'
), nodes_with_new AS (
  SELECT 
    (data->'nodes') || jsonb_build_object(
      'take_a_shower', jsonb_build_object(
        'type', 'objectiveNode',
        'label', 'Take a Shower',
        'status', 'not-started',
        'parent', 'complete_front_back_end_ui',
        'graph', 'main'
      )
    ) AS nodes,
    data
  FROM current
), nodes_updated AS (
  SELECT 
    jsonb_set(
      nodes,
      '{stine_project_completed,parent}',
      to_jsonb('take_a_shower'::text),
      true
    ) AS nodes,
    data
  FROM nodes_with_new
)
UPDATE graph_documents g
SET data = jsonb_set(g.data, '{nodes}', nodes_updated.nodes, false)
FROM nodes_updated
WHERE g.id = 'main';


