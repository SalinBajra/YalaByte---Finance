-- Permanently deletes the latest payroll-like transaction.
-- Use only for setup/test data that must not remain in Finance records.

delete from public.finance_transactions
where id = (
  select id
  from public.finance_transactions
  where transaction_type = 'expense'
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
