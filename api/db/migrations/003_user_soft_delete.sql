alter table users add column if not exists deleted_at timestamptz;
alter table users drop constraint if exists users_email_key;
create unique index if not exists users_email_active_idx on users (email) where deleted_at is null;
create index if not exists users_deleted_at_idx on users (deleted_at) where deleted_at is not null;