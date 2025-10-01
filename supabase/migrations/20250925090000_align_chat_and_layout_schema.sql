-- Align chat and layout persistence with the normalized table structure

-- Drop legacy aggregates if they exist
drop table if exists public.chat_documents;
drop table if exists public.layout_state;

-- Ensure helper for updated_at is present
create or replace function public.touch_updated_at()
returns trigger as $$
begin
    new.updated_at = timezone('utc', now());
    return new;
end;
$$ language plpgsql;

-- Chat threads store metadata for branch selections and timestamps
create table if not exists public.chat_threads (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create trigger chat_threads_set_updated
    before update on public.chat_threads
    for each row execute function public.touch_updated_at();

-- Individual chat messages with branching via parent_id
create table if not exists public.chat_messages (
    id uuid primary key default gen_random_uuid(),
    thread_id uuid not null references public.chat_threads(id) on delete cascade,
    parent_id uuid references public.chat_messages(id) on delete cascade,
    role text not null check (role in ('system', 'user', 'assistant', 'tool')),
    content text not null,
    thinking text,
    tool_calls jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create trigger chat_messages_set_updated
    before update on public.chat_messages
    for each row execute function public.touch_updated_at();

-- Draft text per thread (single row)
create table if not exists public.chat_drafts (
    thread_id uuid primary key references public.chat_threads(id) on delete cascade,
    draft_text text not null default '',
    updated_at timestamptz not null default timezone('utc', now())
);

create trigger chat_drafts_set_updated
    before update on public.chat_drafts
    for each row execute function public.touch_updated_at();

-- Layout border positions per adjustable divider
create table if not exists public.layout_borders (
    border_id text primary key,
    axis text not null check (axis in ('x', 'y')),
    position double precision not null,
    updated_at timestamptz not null default timezone('utc', now())
);

create trigger layout_borders_set_updated
    before update on public.layout_borders
    for each row execute function public.touch_updated_at();
