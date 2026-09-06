create table if not exists issues (
  id uuid primary key,
  title text not null check (char_length(Title) between 1 and 120),
  details text not null default '',
  category text not null check (category in ('equipment', 'safety', 'cleanliness', 'inventory', 'other')),
  priority text not null check (priority in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'assigned', 'in_progress', 'resolved')),
  location text not null,
  assignee text,
  ai_summary text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists issues_created_idx on issues (created_at desc, id desc);
create index if not exists issues_stats_created_idx on issues (status, created_at desc);