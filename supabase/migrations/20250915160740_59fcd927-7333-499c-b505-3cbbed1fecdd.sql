-- Update the graph value on the two new nodes to "get_cuvitru"
UPDATE graph_documents 
SET data = jsonb_set(
  jsonb_set(
    data,
    '{nodes,call_insurance,graph}',
    '"get_cuvitru"'
  ),
  '{nodes,call_doctors_office,graph}',
  '"get_cuvitru"'
)
WHERE id = 'main';