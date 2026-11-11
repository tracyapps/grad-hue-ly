-- One JSON snapshot of a player's progress (and their Studio library) per
-- Neon Auth user. The app merges on the client; the server just keeps the
-- latest merged copy. user_id is the auth JWT's `sub`.
create table if not exists profiles (
  user_id    text primary key,
  data       jsonb not null,
  version    integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint profiles_data_is_object check (jsonb_typeof(data) = 'object'),
  constraint profiles_data_size check (pg_column_size(data) < 1048576)
);
