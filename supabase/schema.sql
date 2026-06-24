-- Run in the Supabase SQL editor once. CRM and Finance must use this same project.
create type public.app_role as enum ('admin', 'finance', 'member');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique check (lower(email) like '%@yalabyte.com'),
  full_name text,
  role public.app_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.current_user_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create policy "Users can read their own profile"
on public.profiles for select to authenticated
using (id = auth.uid());

-- Role changes must happen through a protected CRM server endpoint using the
-- Supabase service-role key. Never expose that key in either browser app.

create table public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_date date not null default current_date,
  description text not null,
  party text,
  category text not null,
  transaction_type text not null check (transaction_type in ('income', 'expense')),
  amount_npr numeric(14,2) not null check (amount_npr > 0),
  status text not null default 'cleared' check (status in ('pending', 'cleared', 'void')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.finance_transactions enable row level security;

create policy "Finance roles can read transactions"
on public.finance_transactions for select to authenticated
using (public.current_user_role() in ('admin', 'finance'));

create policy "Finance roles can create transactions"
on public.finance_transactions for insert to authenticated
with check (public.current_user_role() in ('admin', 'finance') and created_by = auth.uid());

create policy "Finance roles can update transactions"
on public.finance_transactions for update to authenticated
using (public.current_user_role() in ('admin', 'finance'))
with check (public.current_user_role() in ('admin', 'finance'));
