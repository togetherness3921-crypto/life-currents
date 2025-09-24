-- Create new document-based graph_state table
CREATE TABLE graph_documents (
  id TEXT PRIMARY KEY DEFAULT 'main',
  data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE graph_documents ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (same as current structure)
CREATE POLICY "Anyone can view graph documents" 
ON graph_documents 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can update graph documents" 
ON graph_documents 
FOR UPDATE 
USING (true);

CREATE POLICY "Anyone can insert graph documents" 
ON graph_documents 
FOR INSERT 
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_graph_documents_updated_at
BEFORE UPDATE ON graph_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Migrate existing data to document structure
INSERT INTO graph_documents (id, data) VALUES (
  'main',
  jsonb_build_object(
    'where_we_are_now', jsonb_build_object(
      'type', 'startNode',
      'label', 'Where We Are Now',
      'status', 'not-started',
      'position', jsonb_build_object('x', -307.69279941764154, 'y', 623.4612390840286),
      'expanded', false
    ),
    'get_cuvitru', jsonb_build_object(
      'type', 'objectiveNode',
      'label', 'Get Cuvitru',
      'status', 'not-started',
      'position', jsonb_build_object('x', 209.0124538675242, 'y', 57.12783491968764),
      'expanded', true,
      'items', jsonb_build_array(
        jsonb_build_object('label', 'Call Insurance Tomorrow AM', 'status', 'not-started'),
        jsonb_build_object('label', 'Dr. Sievert Tuesday 3pm', 'status', 'not-started'),
        jsonb_build_object('label', 'Sort Out Process', 'status', 'not-started'),
        jsonb_build_object('label', 'Get Insurance Reactivated', 'status', 'not-started'),
        jsonb_build_object('label', 'Call Mother to Pay', 'status', 'not-started'),
        jsonb_build_object('label', 'Confirm Reactivated', 'status', 'not-started'),
        jsonb_build_object('label', 'Cuvitru Obtained', 'status', 'not-started')
      )
    ),
    'work_while_waiting', jsonb_build_object(
      'type', 'objectiveNode',
      'label', 'Work While Waiting',
      'status', 'not-started',
      'position', jsonb_build_object('x', 210.2073677025601, 'y', 656.2434776763889),
      'expanded', true,
      'items', jsonb_build_array(
        jsonb_build_object('label', 'UI Design Tasks', 'status', 'not-started'),
        jsonb_build_object('label', 'Code Reviews', 'status', 'not-started'),
        jsonb_build_object('label', 'Documentation', 'status', 'not-started')
      )
    ),
    'get_full_work_time', jsonb_build_object(
      'type', 'milestoneNode',
      'label', 'Get Full Work Time',
      'status', 'not-started',
      'position', jsonb_build_object('x', 667.6458783783784, 'y', 347.6509797297297),
      'expanded', false
    ),
    'complete_front_back_end_ui', jsonb_build_object(
      'type', 'objectiveNode',
      'label', 'Complete Front/Back End UI',
      'status', 'not-started',
      'position', jsonb_build_object('x', 824.5139268601957, 'y', 376.539122053434),
      'expanded', true,
      'items', jsonb_build_array(
        jsonb_build_object('label', 'Frontend Components', 'status', 'not-started'),
        jsonb_build_object('label', 'Backend API', 'status', 'not-started'),
        jsonb_build_object('label', 'Integration Testing', 'status', 'not-started')
      )
    ),
    'stine_project_completed', jsonb_build_object(
      'type', 'milestoneNode',
      'label', 'Stine Project Completed',
      'status', 'not-started',
      'position', jsonb_build_object('x', 1200, 'y', 300),
      'expanded', false
    ),
    'live_forever', jsonb_build_object(
      'type', 'goalNode',
      'label', 'Live Forever',
      'status', 'not-started',
      'position', jsonb_build_object('x', 1500, 'y', 300),
      'expanded', false
    ),
    'relationships', jsonb_build_array(
      jsonb_build_object('from', 'where_we_are_now', 'to', 'get_cuvitru'),
      jsonb_build_object('from', 'where_we_are_now', 'to', 'work_while_waiting'),
      jsonb_build_object('from', 'get_cuvitru', 'to', 'get_full_work_time'),
      jsonb_build_object('from', 'work_while_waiting', 'to', 'get_full_work_time'),
      jsonb_build_object('from', 'get_full_work_time', 'to', 'complete_front_back_end_ui'),
      jsonb_build_object('from', 'complete_front_back_end_ui', 'to', 'stine_project_completed'),
      jsonb_build_object('from', 'stine_project_completed', 'to', 'live_forever')
    ),
    'viewport', jsonb_build_object('x', 0, 'y', 0, 'zoom', 1),
    'active_node', null::text
  )
);