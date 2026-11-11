-- Public player names and community-shared boards.

create table if not exists players (
  user_id    text primary key,
  -- lowercase handle shown as @name; uniqueness is case-insensitive because
  -- we only ever store the lowercased form
  username   text not null unique
             check (username ~ '^[a-z0-9][a-z0-9_.-]{1,18}[a-z0-9]$'),
  created_at timestamptz not null default now()
);

create table if not exists boards (
  id          text primary key,
  author_id   text not null references players(user_id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  kind        text not null check (kind in ('corners', 'image')),
  -- corners: ["#rrggbb" ×4] (TL, TR, BL, BR); null for image boards
  corners     jsonb,
  -- the canonical 12×18 color grid every board can be played from
  canonical   jsonb not null,
  -- a fingerprint of the colors, so the same board can't be shared twice
  fingerprint text not null unique,
  solves      integer not null default 0,
  hidden      boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint boards_corners_shape check (corners is null or jsonb_array_length(corners) = 4),
  constraint boards_canonical_shape check (jsonb_array_length(canonical) = 216)
);

create index if not exists boards_new_idx on boards (created_at desc) where not hidden;
create index if not exists boards_popular_idx on boards (solves desc, created_at desc) where not hidden;
create index if not exists boards_author_idx on boards (author_id, created_at desc);
