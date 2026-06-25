-- Safe to run more than once in the shared Supabase project.
-- Repairs Finance table privileges and syncs Finance access from CRM team roles.

alter table public.profiles
  add column if not exists avatar_url text;

alter table public.team_members
  add column if not exists avatar_url text not null default '';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-avatars', 'team-avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view team avatars" on storage.objects;
create policy "Public can view team avatars"
on storage.objects for select
using (bucket_id = 'team-avatars');

drop policy if exists "Team can upload own avatar" on storage.objects;
create policy "Team can upload own avatar"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'team-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
  and lower(coalesce(auth.jwt() ->> 'email', '')) like '%@yalabyte.com'
);

drop policy if exists "Team can update own avatar" on storage.objects;
create policy "Team can update own avatar"
on storage.objects for update to authenticated
using (bucket_id = 'team-avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'team-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Team can delete own avatar" on storage.objects;
create policy "Team can delete own avatar"
on storage.objects for delete to authenticated
using (bucket_id = 'team-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

insert into public.profiles (id, email, full_name, avatar_url, role)
select
  user_id,
  lower(email),
  name,
  avatar_url,
  case when role in ('admin', 'finance') then role else 'member' end::public.app_role
from public.team_members
on conflict (id) do update
set email = excluded.email,
    full_name = excluded.full_name,
    avatar_url = coalesce(nullif(public.profiles.avatar_url, ''), excluded.avatar_url),
    role = excluded.role,
    updated_at = now();

grant select on public.team_members to authenticated;
grant update (full_name, avatar_url, updated_at) on public.profiles to authenticated;

drop policy if exists "Users can update their own Finance profile" on public.profiles;
create policy "Users can update their own Finance profile"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "Finance roles can read payroll team members" on public.team_members;
create policy "Finance roles can read payroll team members"
on public.team_members for select to authenticated
using (public.current_user_role() in ('admin', 'finance'));

grant select, insert, update on public.finance_transactions to authenticated;
grant select, insert, update on public.finance_deals to authenticated;
grant select, insert, update on public.finance_invoices to authenticated;

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

alter table public.finance_invoices
  add column if not exists amount_paid_npr numeric(14,2) not null default 0,
  add column if not exists balance_due_npr numeric(14,2) not null default 0;

update public.finance_invoices
set balance_due_npr = case
    when status in ('paid', 'cancelled') then 0
    else amount_due_npr
  end,
  amount_paid_npr = case
    when status = 'paid' then amount_due_npr
    else amount_paid_npr
  end
where balance_due_npr = 0 and status not in ('paid', 'cancelled');

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

alter table public.finance_invoice_events
  drop constraint if exists finance_invoice_events_event_type_check,
  add constraint finance_invoice_events_event_type_check
    check (event_type in ('created', 'updated', 'payment_received', 'payment_pending', 'cancelled', 'email_queued'));

alter table public.finance_invoice_events enable row level security;

drop policy if exists "Finance roles can read invoice audit events" on public.finance_invoice_events;
create policy "Finance roles can read invoice audit events"
on public.finance_invoice_events for select to authenticated
using (public.current_user_role() in ('admin', 'finance'));

drop policy if exists "Finance roles can create invoice audit events" on public.finance_invoice_events;
create policy "Finance roles can create invoice audit events"
on public.finance_invoice_events for insert to authenticated
with check (public.current_user_role() in ('admin', 'finance') and actor_id = auth.uid());

grant select, insert on public.finance_invoice_events to authenticated;
grant select, insert on public.finance_invoice_events to service_role;

create table if not exists public.finance_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id text not null references public.finance_invoices(id) on delete cascade,
  amount_npr numeric(14,2) not null check (amount_npr > 0),
  payment_method text not null default 'bank_transfer',
  note text not null default '',
  received_by uuid not null references public.profiles(id),
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.finance_invoice_payments enable row level security;

drop policy if exists "Finance roles can read invoice payments" on public.finance_invoice_payments;
create policy "Finance roles can read invoice payments"
on public.finance_invoice_payments for select to authenticated
using (public.current_user_role() in ('admin', 'finance'));

drop policy if exists "Finance roles can create invoice payments" on public.finance_invoice_payments;
create policy "Finance roles can create invoice payments"
on public.finance_invoice_payments for insert to authenticated
with check (public.current_user_role() in ('admin', 'finance') and received_by = auth.uid());

grant select, insert on public.finance_invoice_payments to authenticated;

create table if not exists public.finance_payroll_events (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.finance_transactions(id) on delete cascade,
  event_type text not null check (event_type in ('created', 'updated', 'voided')),
  actor_id uuid not null references public.profiles(id),
  actor_name text not null default '',
  actor_email text not null default '',
  payee_name text not null default '',
  payroll_detail text not null default '',
  amount_npr numeric(14,2) not null default 0,
  note text not null default '',
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.finance_payroll_events
  drop constraint if exists finance_payroll_events_event_type_check,
  add constraint finance_payroll_events_event_type_check
    check (event_type in ('created', 'updated', 'voided'));

alter table public.finance_payroll_events enable row level security;

drop policy if exists "Finance roles can read payroll audit events" on public.finance_payroll_events;
create policy "Finance roles can read payroll audit events"
on public.finance_payroll_events for select to authenticated
using (public.current_user_role() in ('admin', 'finance'));

drop policy if exists "Finance roles can create payroll audit events" on public.finance_payroll_events;
create policy "Finance roles can create payroll audit events"
on public.finance_payroll_events for insert to authenticated
with check (public.current_user_role() in ('admin', 'finance') and actor_id = auth.uid());

grant select, insert on public.finance_payroll_events to authenticated;

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

alter table public.finance_invoice_emails
  add column if not exists attachment_filename text not null default '',
  add column if not exists attachment_base64 text not null default '';

alter table public.finance_invoice_emails
  drop constraint if exists finance_invoice_emails_status_check,
  add constraint finance_invoice_emails_status_check
    check (status in ('queued', 'sent', 'failed', 'cancelled'));

alter table public.finance_invoice_emails enable row level security;

drop policy if exists "Finance roles can read invoice emails" on public.finance_invoice_emails;
create policy "Finance roles can read invoice emails"
on public.finance_invoice_emails for select to authenticated
using (public.current_user_role() in ('admin', 'finance'));

drop policy if exists "Finance roles can queue invoice emails" on public.finance_invoice_emails;
create policy "Finance roles can queue invoice emails"
on public.finance_invoice_emails for insert to authenticated
with check (public.current_user_role() in ('admin', 'finance') and created_by = auth.uid());

drop policy if exists "Finance roles can update invoice email status" on public.finance_invoice_emails;
create policy "Finance roles can update invoice email status"
on public.finance_invoice_emails for update to authenticated
using (public.current_user_role() in ('admin', 'finance'))
with check (public.current_user_role() in ('admin', 'finance'));

grant select, insert, update on public.finance_invoice_emails to authenticated;
grant select, insert, update on public.finance_invoice_emails to service_role;

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
  alter publication supabase_realtime add table public.finance_invoice_payments;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.finance_payroll_events;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.finance_invoice_emails;
exception when duplicate_object then null;
end $$;
