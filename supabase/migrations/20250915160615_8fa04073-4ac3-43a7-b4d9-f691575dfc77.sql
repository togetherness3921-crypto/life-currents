-- Add the two new nodes to the main graph document
UPDATE graph_documents 
SET data = jsonb_set(
  jsonb_set(
    data,
    '{nodes,call_insurance}',
    '{"graph": "Get Cuvitru", "label": "call insurance", "type": "task", "status": "not-started", "parent": "get_cuvitru", "position": {"x": 400, "y": -120}}'
  ),
  '{nodes,call_doctors_office}',
  '{"graph": "Get Cuvitru", "label": "call doctor''s office", "type": "task", "status": "not-started", "parent": "get_cuvitru", "position": {"x": 200, "y": -120}}'
)
WHERE id = 'main';

-- Remove the separate documents since they should be part of the main graph
DELETE FROM graph_documents WHERE id IN ('call_insurance', 'call_doctors_office');