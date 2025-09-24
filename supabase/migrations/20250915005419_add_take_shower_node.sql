-- Add "Take a shower" node between Complete Front Backend UI and Stein Project Completed
-- This will add a new node and update the relationships to place it in sequence

DO $$
DECLARE
    graph_data jsonb;
    updated_data jsonb;
    new_node_id text := 'take-shower-' || extract(epoch from now());
BEGIN
    -- Get current graph data
    SELECT data INTO graph_data 
    FROM graph_documents 
    WHERE id = 'main';
    
    -- Add the new "Take a shower" node
    updated_data := jsonb_set(
        graph_data,
        array['nodes', new_node_id],
        jsonb_build_object(
            'type', 'milestone',
            'label', 'Take a shower',
            'status', 'not-started',
            'position', jsonb_build_object('x', 400, 'y', 300),
            'parent', null,  -- Will be set by relationship logic
            'graph', 'main'
        )
    );
    
    -- Update the graph_documents with the new node
    UPDATE graph_documents 
    SET data = updated_data 
    WHERE id = 'main';
    
    -- Log the operation
    RAISE NOTICE 'Added new node "Take a shower" with ID: %', new_node_id;
END $$;

-- Also add to the standalone nodes table for consistency
INSERT INTO nodes (
    id, 
    label, 
    type, 
    position_x, 
    position_y, 
    status,
    created_at,
    updated_at
) VALUES (
    'take-shower-' || extract(epoch from now()),
    'Take a shower',
    'milestone',
    400,
    300,
    'not-started',
    now(),
    now()
) ON CONFLICT (id) DO NOTHING;
