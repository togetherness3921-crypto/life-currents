import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/integrations/supabase/client';

type ChatThreadMetadata = Record<string, unknown> | null;

type PendingOperation =
  | {
      id: string;
      type: 'chat.upsert_thread';
      payload: {
        id: string;
        title: string;
        metadata: ChatThreadMetadata;
        created_at?: string;
        updated_at?: string;
      };
    }
  | {
      id: string;
      type: 'chat.upsert_message';
      payload: {
        id: string;
        thread_id: string;
        parent_id: string | null;
        role: string;
        content: string;
        thinking?: string | null;
        tool_calls?: unknown;
        created_at?: string;
        updated_at?: string;
      };
    }
  | {
      id: string;
      type: 'chat.update_message';
      payload: {
        id: string;
        fields: Record<string, unknown>;
      };
    }
  | {
      id: string;
      type: 'chat.delete_message';
      payload: {
        id: string;
      };
    }
  | {
      id: string;
      type: 'chat.upsert_draft';
      payload: {
        thread_id: string;
        draft_text: string;
        updated_at?: string;
      };
    }
  | {
      id: string;
      type: 'chat.delete_draft';
      payload: {
        thread_id: string;
      };
    }
  | {
      id: string;
      type: 'layout.upsert_border';
      payload: {
        border_id: string;
        axis: 'x' | 'y';
        position: number;
        updated_at?: string;
      };
    };

const STORAGE_KEY = 'supabase_pending_ops_v1';

const loadQueue = (): PendingOperation[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingOperation[];
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (error) {
    console.warn('[SupabaseQueue] Failed to parse queue', error);
    return [];
  }
};

const saveQueue = (queue: PendingOperation[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.warn('[SupabaseQueue] Failed to persist queue', error);
  }
};

const queue: PendingOperation[] = loadQueue();
let isFlushing = false;

const executeOperation = async (operation: PendingOperation): Promise<boolean> => {
  try {
    switch (operation.type) {
      case 'chat.upsert_thread': {
        const { error } = await supabase.from('chat_threads').upsert(operation.payload);
        if (error) throw error;
        return true;
      }
      case 'chat.upsert_message': {
        const { error } = await supabase.from('chat_messages').upsert(operation.payload);
        if (error) throw error;
        return true;
      }
      case 'chat.update_message': {
        const { error } = await supabase
          .from('chat_messages')
          .update(operation.payload.fields)
          .eq('id', operation.payload.id);
        if (error) throw error;
        return true;
      }
      case 'chat.delete_message': {
        const { error } = await supabase.from('chat_messages').delete().eq('id', operation.payload.id);
        if (error) throw error;
        return true;
      }
      case 'chat.upsert_draft': {
        const { error } = await supabase.from('chat_drafts').upsert(operation.payload);
        if (error) throw error;
        return true;
      }
      case 'chat.delete_draft': {
        const { error } = await supabase.from('chat_drafts').delete().eq('thread_id', operation.payload.thread_id);
        if (error) throw error;
        return true;
      }
      case 'layout.upsert_border': {
        const { error } = await supabase.from('layout_borders').upsert(operation.payload);
        if (error) throw error;
        return true;
      }
      default:
        return true;
    }
  } catch (error) {
    console.warn('[SupabaseQueue] Operation failed', operation.type, error);
    return false;
  }
};

export const enqueueOperation = (operation: PendingOperation) => {
  queue.push(operation);
  saveQueue(queue);
};

export const flushSupabaseQueue = async () => {
  if (isFlushing) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  isFlushing = true;
  try {
    while (queue.length > 0) {
      const next = queue[0];
      const success = await executeOperation(next);
      if (!success) {
        break;
      }
      queue.shift();
      saveQueue(queue);
    }
  } finally {
    isFlushing = false;
  }
};

export const submitSupabaseOperation = async <T extends PendingOperation['type']>(
  type: T,
  payload: Extract<PendingOperation, { type: T }>['payload']
): Promise<boolean> => {
  const operation = { id: uuidv4(), type, payload } as PendingOperation;

  if (typeof navigator !== 'undefined' && navigator.onLine) {
    const success = await executeOperation(operation);
    if (success) {
      // try to flush any existing queued operations as well
      await flushSupabaseQueue();
      return true;
    }
  }

  enqueueOperation(operation);
  return false;
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void flushSupabaseQueue();
  });
}

