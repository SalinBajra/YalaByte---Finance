-- Safe to run more than once in the shared Supabase project.
-- Repairs Finance table privileges and syncs Finance access from CRM team roles.

insert into public.profiles (id, email, full_name, role)
select
  user_id,
  lower(email),
  name,
  case when role in ('admin', 'finance') then role else 'member' end::public.app_role
from public.team_members
on conflict (id) do update
set email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role,
    updated_at = now();

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
