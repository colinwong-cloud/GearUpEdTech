-- Social share event logging table for login-page share buttons
-- Run in Supabase SQL Editor once per environment.

create table if not exists public.social_share_events (
  id bigserial primary key,
  created_at timestamptz not null default timezone('utc', now()),
  channel text not null check (channel in ('whatsapp', 'wechat')),
  action text not null,
  status text not null,
  share_url text not null,
  page_path text,
  is_wechat_ua boolean not null default false,
  user_agent text,
  source_ip text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists social_share_events_created_at_idx
  on public.social_share_events (created_at desc);

create index if not exists social_share_events_channel_created_idx
  on public.social_share_events (channel, created_at desc);
