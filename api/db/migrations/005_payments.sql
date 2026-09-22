create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references issues(id),
  vendor_name text not null,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd',
  status text not null default 'unpaid' check (status in ('unpaid', 'processing', 'paid', 'failed', 'refunded')),
  stripe_payment_intent_id text unique,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

create index if not exists invoices_issue_idx on invoices (issue_id, created_at desc);

create table if not exists stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);