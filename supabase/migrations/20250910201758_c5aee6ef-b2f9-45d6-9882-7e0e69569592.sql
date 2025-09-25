-- Create table for storing graph viewport and session state
CREATE TABLE public.graph_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  active_node_id TEXT,
  viewport_x NUMERIC DEFAULT 0,
  viewport_y NUMERIC DEFAULT 0,
  viewport_zoom NUMERIC DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT single_row_only CHECK (id = 1)
);

-- Enable Row Level Security
ALTER TABLE public.graph_state ENABLE ROW LEVEL SECURITY;

-- Create policies for graph state access
CREATE POLICY "Anyone can view graph state" 
ON public.graph_state 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can update graph state" 
ON public.graph_state 
FOR UPDATE 
USING (true);

CREATE POLICY "Anyone can insert graph state" 
ON public.graph_state 
FOR INSERT 
WITH CHECK (true);

-- Insert initial row
INSERT INTO public.graph_state (id) VALUES (1);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_graph_state_updated_at
BEFORE UPDATE ON public.graph_state
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();