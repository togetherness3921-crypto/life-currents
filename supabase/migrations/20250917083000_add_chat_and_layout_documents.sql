create table if not exists public.chat_documents (
    id text primary key,
    data jsonb not null,
    version bigint not null default 0,
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.layout_state (
    id text primary key,
    data jsonb not null,
    updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.touch_updated_at()
returns trigger as $$
begin
    new.updated_at = timezone('utc', now());
    return new;
end;
$$ language plpgsql;

create trigger chat_documents_set_updated
    before update on public.chat_documents
    for each row execute function public.touch_updated_at();

create trigger layout_state_set_updated
    before update on public.layout_state
    for each row execute function public.touch_updated_at();
