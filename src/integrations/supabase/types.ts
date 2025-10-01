export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      chat_threads: {
        Row: {
          id: string;
          title: string | null;
          metadata: Json | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          title?: string | null;
          metadata?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          title?: string | null;
          metadata?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          thread_id: string;
          parent_id: string | null;
          role: string;
          content: string | null;
          thinking: string | null;
          tool_calls: Json | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          thread_id: string;
          parent_id?: string | null;
          role: string;
          content?: string | null;
          thinking?: string | null;
          tool_calls?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          thread_id?: string;
          parent_id?: string | null;
          role?: string;
          content?: string | null;
          thinking?: string | null;
          tool_calls?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'chat_messages_thread_id_fkey';
            columns: ['thread_id'];
            isOneToOne: false;
            referencedRelation: 'chat_threads';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'chat_messages_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'chat_messages';
            referencedColumns: ['id'];
          }
        ];
      };
      chat_drafts: {
        Row: {
          thread_id: string;
          draft_text: string | null;
          updated_at: string | null;
        };
        Insert: {
          thread_id: string;
          draft_text?: string | null;
          updated_at?: string | null;
        };
        Update: {
          thread_id?: string;
          draft_text?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'chat_drafts_thread_id_fkey';
            columns: ['thread_id'];
            isOneToOne: true;
            referencedRelation: 'chat_threads';
            referencedColumns: ['id'];
          }
        ];
      };
      graph_documents: {
        Row: {
          id: string;
          document: Json;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          document: Json;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          document?: Json;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      system_instructions: {
        Row: {
          id: string;
          content: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          content?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          content?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      layout_borders: {
        Row: {
          border_id: string;
          axis: 'x' | 'y';
          position: number | null;
          updated_at: string | null;
        };
        Insert: {
          border_id: string;
          axis: 'x' | 'y';
          position?: number | null;
          updated_at?: string | null;
        };
        Update: {
          border_id?: string;
          axis?: 'x' | 'y';
          position?: number | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
