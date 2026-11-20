-- SocialTush: storage for contact messages, orders, bookings and affiliate applications.
-- Run once in Supabase -> SQL Editor -> New query -> paste -> Run.
-- Safe to run again.

create table if not exists public.inquiries (
  id            bigint generated always as identity primary key,
  ref           text not null unique,
  created_at    timestamptz not null default now(),
  kind          text not null check (kind in ('contact', 'order', 'booking', 'affiliate')),
  status        text not null default 'new'
                check (status in ('new', 'in_progress', 'quoted', 'confirmed', 'completed', 'cancelled')),
  user_id       uuid references auth.users (id) on delete set null,
  name          text not null,
  email         text not null,
  phone         text,
  service       text,
  budget        text,
  deadline      date,
  booking_date  date,
  booking_time  text,
  timezone      text,
  message       text,
  details       jsonb not null default '{}'::jsonb,
  email_sent    boolean not null default false,
  ip_hash       text
);

create index if not exists inquiries_created_at_idx on public.inquiries (created_at desc);
create index if not exists inquiries_user_id_idx    on public.inquiries (user_id);
create index if not exists inquiries_ip_recent_idx  on public.inquiries (ip_hash, created_at desc);

-- Row Level Security: the website can NOT read or write this table directly.
-- Only the submit-inquiry Edge Function (service role) inserts rows.
-- Logged-in customers can see their own requests on the My account page.
alter table public.inquiries enable row level security;

drop policy if exists "Customers read their own requests" on public.inquiries;
create policy "Customers read their own requests"
  on public.inquiries for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Only expose what the account page needs
revoke all on public.inquiries from anon, authenticated;
grant select (ref, created_at, kind, status, service, booking_date, booking_time) on public.inquiries to authenticated;
