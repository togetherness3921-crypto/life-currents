-- Create nodes table for graph nodes
CREATE TABLE public.nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('startNode', 'objectiveNode', 'milestoneNode', 'validationNode', 'goalNode')),
  position_x NUMERIC NOT NULL,
  position_y NUMERIC NOT NULL,
  label TEXT NOT NULL,
  status TEXT DEFAULT 'not-started' CHECK (status IN ('not-started', 'in-progress', 'completed', 'blocked')),
  expanded BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create sub_objectives table for expandable objectives
CREATE TABLE public.sub_objectives (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  status TEXT DEFAULT 'not-started' CHECK (status IN ('not-started', 'in-progress', 'completed', 'blocked')),
  order_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create edges table for connections
CREATE TABLE public.edges (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  animated BOOLEAN DEFAULT true,
  style JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edges ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (adjust based on your auth needs)
CREATE POLICY "Anyone can view nodes" ON public.nodes FOR SELECT USING (true);
CREATE POLICY "Anyone can modify nodes" ON public.nodes FOR ALL USING (true);

CREATE POLICY "Anyone can view sub_objectives" ON public.sub_objectives FOR SELECT USING (true);
CREATE POLICY "Anyone can modify sub_objectives" ON public.sub_objectives FOR ALL USING (true);

CREATE POLICY "Anyone can view edges" ON public.edges FOR SELECT USING (true);
CREATE POLICY "Anyone can modify edges" ON public.edges FOR ALL USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_nodes_updated_at
  BEFORE UPDATE ON public.nodes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sub_objectives_updated_at
  BEFORE UPDATE ON public.sub_objectives
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_edges_updated_at
  BEFORE UPDATE ON public.edges
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for all tables
ALTER TABLE public.nodes REPLICA IDENTITY FULL;
ALTER TABLE public.sub_objectives REPLICA IDENTITY FULL;
ALTER TABLE public.edges REPLICA IDENTITY FULL;

-- Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.nodes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sub_objectives;
ALTER PUBLICATION supabase_realtime ADD TABLE public.edges;

-- Insert initial data
INSERT INTO public.nodes (id, type, position_x, position_y, label, status, expanded) VALUES
  ('1', 'startNode', 50, 300, 'Where We Are Now', 'completed', false),
  ('2', 'objectiveNode', 300, 200, 'Get Cuvitru', 'in-progress', true),
  ('3', 'objectiveNode', 300, 400, 'Get Groceries', 'not-started', false),
  ('4', 'objectiveNode', 300, 500, 'Work While Waiting', 'not-started', false),
  ('5', 'milestoneNode', 650, 300, 'Get Full Work Time', 'not-started', false),
  ('6', 'objectiveNode', 900, 300, 'Complete Front/Back End UI', 'not-started', false),
  ('7', 'milestoneNode', 1200, 300, 'Stine Project Completed', 'not-started', false),
  ('8', 'goalNode', 1500, 300, 'Live Forever', 'not-started', false);

INSERT INTO public.sub_objectives (id, node_id, label, status, order_index) VALUES
  ('sub-1', '2', 'Call Insurance Tomorrow AM', 'not-started', 1),
  ('sub-2', '2', 'Dr. Sievert Tuesday 3pm', 'not-started', 2),
  ('sub-3', '2', 'Sort Out Process', 'not-started', 3),
  ('sub-4', '2', 'Get Insurance Reactivated', 'not-started', 4),
  ('sub-5', '2', 'Call Mother to Pay', 'not-started', 5),
  ('sub-6', '2', 'Confirm Reactivated', 'not-started', 6),
  ('sub-7', '2', 'Cuvitru Obtained', 'not-started', 7),
  ('sub-8', '3', 'Make Shopping List', 'not-started', 1),
  ('sub-9', '3', 'Drive to Store', 'not-started', 2),
  ('sub-10', '3', 'Shop & Pay', 'not-started', 3),
  ('sub-11', '4', 'UI Design Tasks', 'not-started', 1),
  ('sub-12', '4', 'Code Reviews', 'not-started', 2),
  ('sub-13', '4', 'Documentation', 'not-started', 3),
  ('sub-14', '6', 'Frontend Components', 'not-started', 1),
  ('sub-15', '6', 'Backend API', 'not-started', 2),
  ('sub-16', '6', 'Integration Testing', 'not-started', 3);

INSERT INTO public.edges (id, source_id, target_id, animated, style) VALUES
  ('e1-2', '1', '2', true, '{}'),
  ('e1-3', '1', '3', true, '{}'),
  ('e1-4', '1', '4', true, '{}'),
  ('e2-5', '2', '5', true, '{}'),
  ('e3-5', '3', '5', true, '{}'),
  ('e4-5', '4', '5', true, '{"strokeDasharray": "5,5"}'),
  ('e5-6', '5', '6', true, '{}'),
  ('e6-7', '6', '7', true, '{}'),
  ('e7-8', '7', '8', true, '{}');