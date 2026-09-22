create table if not exists invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  position integer not null,
  kind text not null check (kind in ('parts', 'labor', 'trip', 'other')),
  description text not null,
  amount_cents integer not null check (amount_cents > 0),
  unique (invoice_id, position)
);

create index if not exists invoice_lines_invoice_idx 
on invoice_lines (invoice_id, position);

create table if not exists invoice_refunds (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id),
  amount_cents integer not null check (amount_cents > 0),
  reason text not null,
  stripe_refund_id text unique,
  allocation jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists invoice_refunds_invoice_idx 
on invoice_refunds (invoice_id, created_at);