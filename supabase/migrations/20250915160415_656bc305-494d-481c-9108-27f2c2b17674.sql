-- Update the Get Cuvitru node label to "Get Cuvitru X"
UPDATE graph_documents 
SET data = jsonb_set(
  data, 
  '{nodes,get_cuvitru,label}', 
  '"Get Cuvitru X"'
)
WHERE id = 'main' AND data->'nodes'->'get_cuvitru'->>'label' = 'Get Cuvitru';