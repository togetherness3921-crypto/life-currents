-- Update parent relationships again to override frontend updates
UPDATE graph_documents 
SET data = jsonb_set(
  jsonb_set(
    data,
    '{nodes,call_doctors_office,parent}',
    'null'
  ),
  '{nodes,call_insurance,parent}',
  '"call_doctors_office"'
)
WHERE id = 'main';