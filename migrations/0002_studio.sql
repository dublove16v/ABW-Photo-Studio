create table if not exists vehicles (
  id text primary key,
  user_id text not null,
  catalog_key text not null default '',
  vin text not null,
  stock text not null,
  year integer not null,
  make text not null,
  model text not null,
  color text not null default '',
  status text not null default 'capture',
  backdrop text not null default 'studio',
  created_at timestamptz not null default now()
);

create index if not exists vehicles_user_idx on vehicles (user_id);

create table if not exists shots (
  id text primary key,
  vehicle_id text not null,
  user_id text not null,
  shot_key text not null,
  sort_order integer not null,
  mode text not null,
  status text not null default 'empty',
  confidence integer not null default 100,
  flagged boolean not null default false,
  approved boolean not null default false,
  unique (vehicle_id, shot_key)
);

create index if not exists shots_user_idx on shots (user_id, vehicle_id);

create table if not exists shot_defaults (
  user_id text not null,
  shot_key text not null,
  mode text not null,
  primary key (user_id, shot_key)
);

create table if not exists delivery_settings (
  user_id text primary key,
  method text not null default 'url_feed',
  endpoint text not null default ''
);
