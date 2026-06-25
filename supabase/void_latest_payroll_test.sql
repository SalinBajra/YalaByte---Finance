-- Voids the latest active payroll-like transaction.
-- Run this only if the most recent payroll entry is the test record you want hidden.

update public.finance_transactions
set status = 'void'
where id = (
  select id
  from public.finance_transactions
  where transaction_type = 'expense'
    and status <> 'void'
    and (
      lower(category) in ('payroll', 'contractor', 'benefits', 'bonus')
      or lower(description) like '%payroll%'
      or lower(description) like '%salary%'
      or lower(description) like '%contractor%'
      or lower(description) like '%benefits%'
      or lower(description) like '%bonus%'
    )
  order by created_at desc
  limit 1
);
