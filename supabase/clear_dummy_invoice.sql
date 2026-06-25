-- Clears the test invoice created during Finance setup.
-- Run this in Supabase SQL editor only if this invoice is dummy data.

begin;

with target_invoice as (
  select id, deal_id, invoice_number
  from public.finance_invoices
  where invoice_number = 'YB-2026-425016'
)
delete from public.finance_transactions
where description in (
  select 'Payment received - ' || invoice_number
  from target_invoice
);

with target_invoice as (
  select id
  from public.finance_invoices
  where invoice_number = 'YB-2026-425016'
)
delete from public.finance_invoice_emails
where invoice_id in (select id from target_invoice);

with target_invoice as (
  select id
  from public.finance_invoices
  where invoice_number = 'YB-2026-425016'
)
delete from public.finance_invoice_events
where invoice_id in (select id from target_invoice);

with target_invoice as (
  select id
  from public.finance_invoices
  where invoice_number = 'YB-2026-425016'
)
delete from public.finance_invoices
where id in (select id from target_invoice);

delete from public.finance_deals
where client_name = 'Salin Man Bajracharya'
  and company = 'Yala Logistics P. Ltd'
  and service = 'Website Development'
  and not exists (
    select 1
    from public.finance_invoices
    where finance_invoices.deal_id = finance_deals.id
  );

commit;
