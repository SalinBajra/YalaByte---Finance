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

grant select, insert, update on public.finance_transactions to authenticated;

create table if not exists public.finance_deals (
  id uuid primary key default gen_random_uuid(),
  crm_lead_id text not null unique,
  client_name text not null,
  company text not null default '',
  email text not null default '',
  phone text not null default '',
  service text not null default '',
  deal_value_npr numeric(14,2) not null default 0,
  owner_name text not null default '',
  owner_email text not null default '',
  status text not null default 'ready_to_invoice' check (status in ('ready_to_invoice', 'invoicing', 'paid', 'archived')),
  lead_data jsonb not null default '{}'::jsonb,
  won_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.finance_deals enable row level security;

create policy "YalaByte team can read finance deal handoffs"
on public.finance_deals for select to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) like '%@yalabyte.com');

create policy "YalaByte team can send won deals to finance"
on public.finance_deals for insert to authenticated
with check (lower(coalesce(auth.jwt() ->> 'email', '')) like '%@yalabyte.com');

create policy "YalaByte team can refresh finance deal handoffs"
on public.finance_deals for update to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) like '%@yalabyte.com')
with check (lower(coalesce(auth.jwt() ->> 'email', '')) like '%@yalabyte.com');

create table if not exists public.finance_invoices (
  id text primary key,
  deal_id uuid not null references public.finance_deals(id) on delete cascade,
  crm_lead_id text not null,
  invoice_number text not null unique,
  status text not null default 'issued' check (status in ('draft', 'issued', 'paid', 'cancelled')),
  amount_due_npr numeric(14,2) not null default 0,
  amount_paid_npr numeric(14,2) not null default 0,
  balance_due_npr numeric(14,2) not null default 0,
  grand_total_npr numeric(14,2) not null default 0,
  due_date date,
  invoice_data jsonb not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.finance_invoices enable row level security;

create policy "Finance roles can read invoices"
on public.finance_invoices for select to authenticated
using (public.current_user_role() in ('admin', 'finance'));

create policy "Finance roles can create invoices"
on public.finance_invoices for insert to authenticated
with check (public.current_user_role() in ('admin', 'finance') and created_by = auth.uid());

create policy "Finance roles can update invoices"
on public.finance_invoices for update to authenticated
using (public.current_user_role() in ('admin', 'finance'))
with check (public.current_user_role() in ('admin', 'finance'));

grant select, insert, update on public.finance_deals to authenticated;
grant select, insert, update on public.finance_invoices to authenticated;

create table if not exists public.finance_invoice_events (
  id uuid primary key default gen_random_uuid(),
  invoice_id text not null references public.finance_invoices(id) on delete cascade,
  event_type text not null check (event_type in ('created', 'updated', 'payment_received', 'payment_pending', 'cancelled', 'email_queued')),
  actor_id uuid not null references public.profiles(id),
  actor_name text not null default '',
  actor_email text not null default '',
  client_name text not null default '',
  invoice_number text not null default '',
  amount_npr numeric(14,2) not null default 0,
  note text not null default '',
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.finance_invoice_events enable row level security;

create policy "Finance roles can read invoice audit events"
on public.finance_invoice_events for select to authenticated
using (public.current_user_role() in ('admin', 'finance'));

create policy "Finance roles can create invoice audit events"
on public.finance_invoice_events for insert to authenticated
with check (public.current_user_role() in ('admin', 'finance') and actor_id = auth.uid());

grant select, insert on public.finance_invoice_events to authenticated;

create table if not exists public.finance_invoice_emails (
  id uuid primary key default gen_random_uuid(),
  invoice_id text not null references public.finance_invoices(id) on delete cascade,
  from_email text not null default 'info@yalabyte.com',
  to_email text not null,
  cc_email text not null default '',
  subject text not null,
  body text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'cancelled')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.finance_invoice_emails enable row level security;

create policy "Finance roles can read invoice emails"
on public.finance_invoice_emails for select to authenticated
using (public.current_user_role() in ('admin', 'finance'));

create policy "Finance roles can queue invoice emails"
on public.finance_invoice_emails for insert to authenticated
with check (public.current_user_role() in ('admin', 'finance') and created_by = auth.uid());

create policy "Finance roles can update invoice email status"
on public.finance_invoice_emails for update to authenticated
using (public.current_user_role() in ('admin', 'finance'))
with check (public.current_user_role() in ('admin', 'finance'));

grant select, insert, update on public.finance_invoice_emails to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.finance_transactions;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.finance_deals;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.finance_invoices;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.finance_invoice_events;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.finance_invoice_emails;
exception when duplicate_object then null;
end $$;
