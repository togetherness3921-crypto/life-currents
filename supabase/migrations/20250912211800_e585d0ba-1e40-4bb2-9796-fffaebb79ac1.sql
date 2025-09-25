-- Enable real-time for graph_documents table
ALTER TABLE public.graph_documents REPLICA IDENTITY FULL;

-- Add graph_documents to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.graph_documents;