import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import chokidar from 'chokidar';

const SUPABASE_URL = "https://cvzgxnspmmxxxwnxiydk.supabase.co";
const SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2emd4bnNwbW14eHh3bnhpeWRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Njg3NzM1OCwiZXhwIjoyMDcyNDUzMzU4fQ.ZDl4Y3OQOeEeZ_QajGB6iRr0Xk3_Z7TMlI92yFmerzI";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const SYNCED_FILES_DIR = path.resolve(process.cwd(), 'synced_files');
const GRAPH_DATA_PATH = path.join(SYNCED_FILES_DIR, 'graph_data.json');
const SYSTEM_INSTRUCTIONS_PATH = path.join(SYNCED_FILES_DIR, 'system_instructions.ts');

let isWritingRemote = false;
let isWritingLocal = false;

async function ensureDirExists() {
    try {
        await fs.access(SYNCED_FILES_DIR);
    } catch {
        await fs.mkdir(SYNCED_FILES_DIR, { recursive: true });
    }
}

async function syncFromSupabase() {
    console.log('Performing initial sync from Supabase...');
    isWritingLocal = true;

    // Sync graph_data.json
    const { data: graphData, error: graphError } = await supabase
        .from('graph_documents')
        .select('data')
        .eq('id', 'main')
        .single();

    if (graphError) console.error('Error fetching graph data:', graphError.message);
    else if (graphData) {
        await fs.writeFile(GRAPH_DATA_PATH, JSON.stringify(graphData.data, null, 2));
        console.log('Synced graph_data.json from Supabase.');
    }

    // Sync system_instructions.ts
    const { data: promptData, error: promptError } = await supabase
        .from('system_instructions')
        .select('content')
        .eq('id', 'main')
        .single();

    if (promptError) console.error('Error fetching system instructions:', promptError.message);
    else if (promptData) {
        const fileContent = `export const systemInstructions = \`${promptData.content}\`;`;
        await fs.writeFile(SYSTEM_INSTRUCTIONS_PATH, fileContent);
        console.log('Synced system_instructions.ts from Supabase.');
    }

    setTimeout(() => { isWritingLocal = false; }, 1000); // Prevent immediate re-trigger
    console.log('Initial sync complete.');
}

function startFileWatcher() {
    const watcher = chokidar.watch([GRAPH_DATA_PATH, SYSTEM_INSTRUCTIONS_PATH], { persistent: true, ignoreInitial: true });

    watcher.on('change', async (filePath) => {
        if (isWritingLocal) return;

        console.log(`Local file change detected: ${path.basename(filePath)}. Syncing to Supabase...`);
        isWritingRemote = true;

        try {
            if (filePath === GRAPH_DATA_PATH) {
                const content = await fs.readFile(filePath, 'utf-8');
                const { error } = await supabase.from('graph_documents').update({ data: JSON.parse(content) }).eq('id', 'main');
                if (error) throw error;
            } else if (filePath === SYSTEM_INSTRUCTIONS_PATH) {
                const content = await fs.readFile(filePath, 'utf-8');
                const instructionsText = content.match(/`([^`]*)`/s)?.[1] || '';
                const { error } = await supabase.from('system_instructions').update({ content: instructionsText }).eq('id', 'main');
                if (error) throw error;
            }
            console.log(`Successfully synced ${path.basename(filePath)} to Supabase.`);
        } catch (e) {
            console.error('Error syncing to Supabase:', e.message);
        } finally {
            setTimeout(() => { isWritingRemote = false; }, 1000);
        }
    });
}

function startSupabaseListener() {
    const channel = supabase.channel('public:synced_files');

    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'graph_documents', filter: 'id=eq.main' }, async (payload) => {
        if (isWritingRemote) return;
        console.log('Remote change detected for graph_data.json. Syncing locally...');
        isWritingLocal = true;
        await fs.writeFile(GRAPH_DATA_PATH, JSON.stringify(payload.new.data, null, 2));
        console.log('Synced graph_data.json from Supabase.');
        setTimeout(() => { isWritingLocal = false; }, 1000);
    });

    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'system_instructions', filter: 'id=eq.main' }, async (payload) => {
        if (isWritingRemote) return;
        console.log('Remote change detected for system_instructions.ts. Syncing locally...');
        isWritingLocal = true;
        const fileContent = `export const systemInstructions = \`${payload.new.content}\`;`;
        await fs.writeFile(SYSTEM_INSTRUCTIONS_PATH, fileContent);
        console.log('Synced system_instructions.ts from Supabase.');
        setTimeout(() => { isWritingLocal = false; }, 1000);
    });

    channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
            console.log('Connected to Supabase for real-time updates.');
        }
    });
}

async function main() {
    await ensureDirExists();
    await syncFromSupabase();
    startFileWatcher();
    startSupabaseListener();
    console.log('Supabase sync utility is running and watching for changes...');
}

main().catch(console.error);
