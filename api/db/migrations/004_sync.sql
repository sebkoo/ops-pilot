create table if not exists idempotency_keys (
  user_id uuid not null references users(id),
  key text not null,
  request_hash text not null,
  status text not null default 'processing' check (status in ('processing', 'completed')),
  response_status integer,
  response_body jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);

create index if not exists idempotency_keys_created_idx on idempotency_keys (created_at);