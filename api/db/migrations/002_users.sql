create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  display_name text not null,
  role text not null default 'staff' check (role in ('staff', 'manager')),
  created_at timestamptz not null default now() 
);

alter table issues add column if not exists created_by uuid references users(id);

create table if not exists issue_events (
  id bigserial primary key,
  issue_id uuid not null references issues(id),
  actor_id uuid references users(id),
  kind text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index if not exists issue_events_issue_idx on issue_events (issue_id, id);
