-- ROLLBACK: Remove the "Take a shower" node that was added in migration 20250915005419
-- This undoes the changes made by the previous migration

DO $$
DECLARE
    graph_data jsonb;
    updated_data jsonb;
    node_key text;
BEGIN
    -- Get current graph data
    SELECT data INTO graph_data 
    FROM graph_documents 
    WHERE id = 'main';
    
    -- Find and remove any node with label "Take a shower"
    FOR node_key IN 
        SELECT key 
        FROM jsonb_each(graph_data->'nodes') 
        WHERE value->>'label' = 'Take a shower'
    LOOP
        -- Remove the node from the graph_data
        updated_data := graph_data;
        updated_data := jsonb_set(
            updated_data,
            array['nodes'],
            (updated_data->'nodes') - node_key
        );
        
        -- Update the graph_documents
        UPDATE graph_documents 
        SET data = updated_data 
        WHERE id = 'main';
        
        -- Also remove from standalone nodes table
        DELETE FROM nodes 
        WHERE label = 'Take a shower' OR id = node_key;
        
        RAISE NOTICE 'Removed "Take a shower" node with ID: %', node_key;
    END LOOP;
    
    -- Clean up any nodes with "Take a shower" label from standalone table
    DELETE FROM nodes WHERE label = 'Take a shower';
    
    RAISE NOTICE 'Rollback completed: "Take a shower" node removed';
END $$;
