create table if not exists photo_assets (
  shot_id text primary key,
  vehicle_id text not null,
  user_id text not null,
  content_hash text not null,
  original_key text not null,
  listing_key text not null default '',
  bytes integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists photo_assets_vehicle_idx on photo_assets (vehicle_id);

create table if not exists photo_jobs (
  id text primary key,
  shot_id text not null,
  vehicle_id text not null,
  user_id text not null,
  content_hash text not null,
  backdrop text not null default 'studio',
  mode text not null default 'swap_all',
  status text not null default 'queued',
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists photo_jobs_status_idx on photo_jobs (status, created_at);
