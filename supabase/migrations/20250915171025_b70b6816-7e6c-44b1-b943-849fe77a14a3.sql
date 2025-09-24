-- Fix the corrupted parent relationships
UPDATE graph_documents 
SET data = jsonb_set(
  data,
  '{nodes,call_doctors_office,parent}',
  'null'
)
WHERE id = 'main';