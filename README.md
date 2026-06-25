# FinByte

Internal finance workspace for YalaByte. The first release includes an executive dashboard, transaction ledger, invoice tracking, expense navigation, payroll, and reporting foundations.

## Local development

```powershell
npm install
npm run dev
```

Copy `.env.example` to `.env` and add the shared Supabase project credentials. Run `supabase/schema.sql` once in the Supabase SQL editor.

Finance accepts only authenticated `@yalabyte.com` users whose shared profile role is `admin` or `finance`. CRM must use the same Supabase project and perform role assignment through a protected server endpoint. Never expose the Supabase service-role key in a browser app.

Transactions are stored in the shared Supabase `finance_transactions` table and protected by row-level security.
