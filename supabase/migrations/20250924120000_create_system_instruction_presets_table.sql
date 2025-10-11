create extension if not exists "uuid-ossp";

create table if not exists system_instruction_presets (
    id uuid primary key default uuid_generate_v4(),
    title text not null,
    content text not null,
    is_active boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists system_instruction_presets_active_unique on system_instruction_presets (is_active) where is_active;

insert into system_instruction_presets (title, content, is_active)
select 'Primary Instruction', content, true
from system_instructions
where id = 'main'
on conflict do nothing;
