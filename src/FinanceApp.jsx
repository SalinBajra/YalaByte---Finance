import { useEffect, useMemo, useState } from 'react';
import InvoiceModal from './InvoiceModal';
import { generateInvoicePdfAttachment } from './InvoiceModal';
import { supabase } from './lib/supabase';

const nav = ['Overview', 'Transactions', 'Invoices', 'Expenses', 'Payroll', 'Reports'];
const money = (value) => `Rs ${new Intl.NumberFormat('en-NP', { maximumFractionDigits: 0 }).format(value)}`;
const date = (value) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
const dateTime = (value) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));

function Icon({ name, active = false }) {
  const icons = { Overview: '⌂', Transactions: '↔', Invoices: '▤', Expenses: '↓', Payroll: '◉', Reports: '⌁' };
  return <span className={`grid h-7 w-7 place-items-center rounded-lg text-sm ${active ? 'bg-white/25 text-ink' : 'bg-white/5 text-cyanbrand-400'}`}>{icons[name]}</span>;
}

function Metric({ label, value, note, tone = 'text-ink' }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft"><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p><p className={`mt-3 text-3xl font-semibold tracking-tight ${tone}`}>{value}</p><p className="mt-2 text-sm text-slate-500">{note}</p></article>;
}

function mapTransaction(item) {
  return { id: item.id, date: item.transaction_date, description: item.description, party: item.party, category: item.category, type: item.transaction_type, amount: Number(item.amount_npr), status: item.status[0].toUpperCase() + item.status.slice(1) };
}

const isPayrollLike = (row) => row.type === 'expense'
  && ['payroll', 'salary', 'contractor', 'benefits', 'bonus'].some((term) => row.category.toLowerCase().includes(term) || row.description.toLowerCase().includes(term));
const isPayrollRow = (row) => isPayrollLike(row) && row.status !== 'Void';

function mapFinanceDeal(item) {
  return { id: item.id, crmLeadId: item.crm_lead_id, name: item.client_name, company: item.company, email: item.email, phone: item.phone, service: item.service, value: Number(item.deal_value_npr || 0), owner: item.owner_name, ownerEmail: item.owner_email, status: item.status, wonAt: item.won_at, invoices: [] };
}

const monthKey = (value) => new Date(value).toISOString().slice(0, 7);
const invoiceClientName = (invoice) => invoice.invoice_data?.company || invoice.invoice_data?.clientName || 'Client';
const invoiceBalance = (invoice) => {
  if (invoice.status === 'paid' || invoice.status === 'cancelled') return 0;
  return Number(invoice.balance_due_npr ?? invoice.amount_due_npr ?? 0);
};
const eventLabel = {
  created: 'Created',
  updated: 'Updated',
  payment_received: 'Payment received',
  payment_pending: 'Payment pending',
  cancelled: 'Cancelled',
  email_queued: 'Email queued'
};

const paymentMethodLabels = {
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  cheque: 'Cheque',
  esewa: 'eSewa',
  khalti: 'Khalti',
  card: 'Card',
  other: 'Other'
};

async function functionErrorMessage(error) {
  try {
    if (error?.context?.json) {
      const body = await error.context.json();
      return body?.error || error.message;
    }
  } catch {
    return error?.message || 'Unknown function error';
  }
  return error?.message || 'Unknown function error';
}

const isMissingOptionalTable = (error, tableName) => {
  const message = error?.message || '';
  return message.includes(tableName) || message.includes("schema cache");
};

const isMissingInvoicePaymentsTable = (error) => isMissingOptionalTable(error, 'finance_invoice_payments');
const isMissingPayrollEventsTable = (error) => isMissingOptionalTable(error, 'finance_payroll_events');

const primaryButton = 'rounded-xl bg-cyanbrand-500 px-4 py-3 text-sm font-bold text-ink shadow-[0_12px_30px_rgba(19,200,222,0.22)] transition hover:-translate-y-0.5 hover:bg-cyanbrand-400';
const panelClass = 'rounded-2xl border border-slate-200 bg-white shadow-sm';
const invoiceStatusClass = {
  paid: 'bg-emerald-50 text-emerald-700',
  issued: 'bg-cyan-50 text-cyan-700',
  cancelled: 'bg-rose-50 text-rose-700',
  draft: 'bg-slate-100 text-slate-600'
};

function EmptyState({ title, note }) {
  return <div className="p-8 text-center"><p className="font-semibold text-ink">{title}</p><p className="mt-1 text-sm text-slate-500">{note}</p></div>;
}

function ProfileMenu({ profile, initials, onSaved, signOut }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(profile?.full_name || '');
  const [avatarFile, setAvatarFile] = useState(null);
  const [preview, setPreview] = useState(profile?.avatar_url || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setName(profile?.full_name || '');
    setPreview(profile?.avatar_url || '');
    setAvatarFile(null);
  }, [profile?.full_name, profile?.avatar_url]);

  useEffect(() => () => {
    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
  }, [preview]);

  const chooseAvatar = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Use a JPG, PNG, or WebP image smaller than 5 MB.');
      return;
    }
    setError('');
    setAvatarFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const save = async (event) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    let avatarUrl = profile?.avatar_url || '';
    if (avatarFile) {
      const extension = avatarFile.name.split('.').pop()?.toLowerCase() || 'jpg';
      const objectPath = `${profile.id}/finance-avatar-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from('team-avatars')
        .upload(objectPath, avatarFile, { cacheControl: '3600', upsert: false });
      if (uploadError) {
        setSaving(false);
        setError(uploadError.message);
        return;
      }
      const { data } = supabase.storage.from('team-avatars').getPublicUrl(objectPath);
      avatarUrl = data.publicUrl;
    }
    const { data, error: updateError } = await supabase
      .from('profiles')
      .update({ full_name: name.trim(), avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq('id', profile.id)
      .select('id, full_name, email, avatar_url, role')
      .single();
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onSaved(data);
    setOpen(false);
  };

  const avatar = preview
    ? <img className="h-full w-full object-cover" src={preview} alt="Profile" />
    : initials;

  return (
    <div className="relative">
      <button className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-ink text-xs font-bold text-white shadow-sm ring-2 ring-cyanbrand-100 transition hover:ring-cyanbrand-400" onClick={() => setOpen((value) => !value)} type="button" aria-label="Profile settings" title="Profile settings">{avatar}</button>
      {open ? (
        <div className="absolute right-0 top-12 z-40 w-[min(92vw,390px)] rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <span className="grid h-12 w-12 place-items-center overflow-hidden rounded-full bg-ink text-xs font-bold text-cyanbrand-400">{avatar}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{profile?.full_name || profile?.email}</p>
              <p className="truncate text-xs text-slate-500">{profile?.email}</p>
            </div>
          </div>
          <form className="mt-4" onSubmit={save}>
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
              <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-ink text-sm font-bold text-cyanbrand-400">{avatar}</span>
              <div>
                <label className="inline-flex cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50">Choose DP<input className="hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseAvatar} /></label>
                <p className="mt-1 text-xs leading-5 text-slate-400">JPG, PNG, or WebP under 5 MB.</p>
              </div>
            </div>
            <label className="mt-4 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Display name<input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium normal-case tracking-normal outline-none focus:border-cyanbrand-500" value={name} onChange={(event) => setName(event.target.value)} /></label>
            <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2"><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Access</p><p className="mt-1 text-sm font-semibold capitalize text-ink">{profile?.role}</p></div>
            {error ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p> : null}
            <div className="mt-4 flex items-center justify-between gap-2"><button className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50" onClick={signOut} type="button">Sign out</button><button className="rounded-lg bg-cyanbrand-500 px-3 py-2 text-xs font-bold text-ink hover:bg-cyanbrand-400 disabled:opacity-60" disabled={saving} type="submit">{saving ? 'Saving...' : 'Save profile'}</button></div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function Overview({ transactions, invoices, onNavigate, name }) {
  const now = new Date();
  const currentMonth = monthKey(now);
  const activeTransactions = transactions.filter((item) => item.status !== 'Void');
  const monthNames = useMemo(() => {
    return Array.from({ length: 6 }, (_, index) => {
      const item = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
      return { key: monthKey(item), label: item.toLocaleString('en-US', { month: 'short' }) };
    });
  }, []);
  const totals = useMemo(() => activeTransactions.reduce((sum, item) => ({ ...sum, [item.type]: sum[item.type] + item.amount }), { income: 0, expense: 0 }), [activeTransactions]);
  const monthRows = activeTransactions.filter((item) => monthKey(item.date) === currentMonth);
  const monthIncome = monthRows.filter((item) => item.type === 'income').reduce((sum, item) => sum + item.amount, 0);
  const monthExpenses = monthRows.filter((item) => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0);
  const openInvoices = invoices.filter((item) => item.status !== 'paid' && item.status !== 'cancelled');
  const receivable = openInvoices.reduce((sum, item) => sum + invoiceBalance(item), 0);
  const cashPosition = totals.income - totals.expense;
  const cashFlow = monthNames.map((month) => {
    const rows = activeTransactions.filter((item) => monthKey(item.date) === month.key);
    const income = rows.filter((item) => item.type === 'income').reduce((sum, item) => sum + item.amount, 0);
    const expense = rows.filter((item) => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0);
    return { ...month, income, expense, net: income - expense };
  });
  const maxFlow = Math.max(...cashFlow.flatMap((item) => [item.income, item.expense]), 0);
  const netThisMonth = monthIncome - monthExpenses;
  return <>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold text-cyanbrand-600">FinByte workspace</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">Good afternoon, {name}.</h1><p className="mt-2 text-slate-500">Here is the financial pulse of YalaByte today.</p></div><button onClick={() => onNavigate('Transactions')} className="rounded-xl bg-cyanbrand-500 px-4 py-3 text-sm font-bold text-ink hover:bg-cyanbrand-400">+ Add transaction</button></div>
    <section className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Metric label="Cash position" value={money(cashPosition)} note="Income minus expenses"/><Metric label="Income this month" value={money(monthIncome)} note={`${monthRows.filter((item) => item.type === 'income').length} income entries`} tone="text-emerald-600"/><Metric label="Expenses this month" value={money(monthExpenses)} note={`${monthRows.filter((item) => item.type === 'expense').length} expense entries`}/><Metric label="Receivables" value={money(receivable)} note={`${openInvoices.length} open invoices`} tone="text-amber-600"/></section>
    <section className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold text-ink">Cash flow</h2><p className="mt-1 text-sm text-slate-500">Six-month operating trend</p></div><span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">{monthNames[0].label} - {monthNames[5].label} {now.getFullYear()}</span></div>{maxFlow ? <><div className="mt-8 flex h-52 items-end gap-3 border-b border-slate-200 px-2">{cashFlow.map((item) => <div key={item.key} className="flex flex-1 items-end justify-center gap-1"><div title={`Income ${money(item.income)}`} className="w-1/2 rounded-t-md bg-cyanbrand-500" style={{height:`${Math.max((item.income / maxFlow) * 100, item.income ? 8 : 0)}%`}}/><div title={`Expenses ${money(item.expense)}`} className="w-1/2 rounded-t-md bg-slate-200" style={{height:`${Math.max((item.expense / maxFlow) * 100, item.expense ? 8 : 0)}%`}}/></div>)}</div><div className="mt-3 grid grid-cols-6 text-center text-xs font-semibold text-slate-400">{cashFlow.map(item => <span key={item.key}>{item.label}</span>)}</div></> : <p className="mt-20 text-center text-sm text-slate-500">No cash movement recorded yet.</p>}</div>
      <div className="rounded-2xl bg-ink p-5 text-white"><p className="text-sm font-semibold text-cyanbrand-400">Operating summary</p><p className="mt-3 text-3xl font-semibold">{money(netThisMonth)}</p><p className="mt-2 text-sm text-slate-400">Net movement this month</p><div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-5"><div><p className="text-xs text-slate-400">Income</p><p className="mt-1 font-semibold">{money(monthIncome)}</p></div><div><p className="text-xs text-slate-400">Expenses</p><p className="mt-1 font-semibold">{money(monthExpenses)}</p></div></div><button onClick={() => onNavigate('Expenses')} className="mt-6 w-full rounded-xl border border-white/15 px-4 py-3 text-sm font-bold hover:bg-white/5">Review expenses</button></div>
    </section>
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h2 className="font-semibold text-ink">Recent activity</h2><p className="mt-1 text-sm text-slate-500">Latest money in and out</p></div><button onClick={() => onNavigate('Transactions')} className="text-sm font-bold text-cyanbrand-600">View all</button></div><TransactionTable rows={activeTransactions.slice(0,4)}/></section>
  </>;
}

function TransactionTable({ rows }) { return <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left"><thead><tr className="text-xs uppercase tracking-wider text-slate-400">{['Date','Description','Category','Status','Amount'].map(h => <th key={h} className="px-5 py-3 font-bold">{h}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t border-slate-100 text-sm"><td className="whitespace-nowrap px-5 py-4 text-slate-500">{date(row.date)}</td><td className="px-5 py-4"><p className="font-semibold text-ink">{row.description}</p><p className="mt-1 text-xs text-slate-400">{row.party}</p></td><td className="px-5 py-4 text-slate-500">{row.category}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${row.status === 'Cleared' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{row.status}</span></td><td className={`px-5 py-4 text-right font-bold ${row.type === 'income' ? 'text-emerald-600' : 'text-ink'}`}>{row.type === 'income' ? '+' : '−'}{money(row.amount)}</td></tr>)}</tbody></table></div>; }

function Transactions({ rows, onAdd, error }) {
  const [form, setForm] = useState({ description: '', party: '', category: 'Software', amount: '', type: 'expense' });
  const [saving, setSaving] = useState(false);
  const activeRows = rows.filter((row) => row.status !== 'Void');
  const submit = async (e) => { e.preventDefault(); if (!form.description || !Number(form.amount)) return; setSaving(true); const saved = await onAdd(form); if (saved) setForm({ description: '', party: '', category: 'Software', amount: '', type: 'expense' }); setSaving(false); };
  return <><h1 className="text-3xl font-semibold tracking-tight text-ink">Transactions</h1><p className="mt-2 text-slate-500">Record and review every active movement of money in Nepali rupees.</p><form onSubmit={submit} className="mt-7 grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 md:grid-cols-2 xl:grid-cols-6">{[['description','Description'],['party','Vendor or client'],['category','Category'],['amount','Amount (Rs)']].map(([key,label]) => <label key={key} className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}<input type={key === 'amount' ? 'number' : 'text'} min={key === 'amount' ? '0' : undefined} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium normal-case tracking-normal outline-none focus:border-cyanbrand-500"/></label>)}<label className="text-xs font-bold uppercase tracking-wider text-slate-500">Type<select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm normal-case"><option value="expense">Expense</option><option value="income">Income</option></select></label><button disabled={saving} className="self-end rounded-xl bg-cyanbrand-500 px-4 py-3 text-sm font-bold text-ink disabled:opacity-60">{saving ? 'Saving…' : 'Add entry'}</button></form>{error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}<div className="mt-5 rounded-2xl border border-slate-200 bg-white">{activeRows.length ? <TransactionTable rows={activeRows}/> : <p className="p-8 text-center text-sm text-slate-500">No active transactions yet. Add the first entry above.</p>}</div></>;
}

function Invoices({ deals, invoices, events, payments, emails, onCreate, onEdit, onPaymentReceived, onPaymentPending, onCancel, onQueueEmail, error }) {
  const billableDealIds = new Set(invoices.filter((invoice) => invoice.status !== 'cancelled').map((invoice) => invoice.deal_id));
  const closedDealIds = new Set(invoices.filter((invoice) => invoice.status === 'paid' || invoice.status === 'cancelled').map((invoice) => invoice.deal_id));
  const readyDeals = deals.filter((deal) => !closedDealIds.has(deal.id) && !billableDealIds.has(deal.id) && ['ready_to_invoice', 'invoicing'].includes(deal.status));
  const openInvoices = invoices.filter((invoice) => invoice.status !== 'paid' && invoice.status !== 'cancelled');
  const paidInvoices = invoices.filter((invoice) => invoice.status === 'paid');
  const cancelledInvoices = invoices.filter((invoice) => invoice.status === 'cancelled');
  const [auditInvoiceId, setAuditInvoiceId] = useState('');
  const auditInvoices = invoices.filter((invoice) => events.some((event) => event.invoice_id === invoice.id));
  const selectedAuditEvents = auditInvoiceId ? events.filter((event) => event.invoice_id === auditInvoiceId) : [];
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('all');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const filteredInvoices = invoices.filter((invoice) => {
    const matchesStatus = invoiceStatusFilter === 'all' || invoice.status === invoiceStatusFilter;
    const search = invoiceSearch.trim().toLowerCase();
    const matchesSearch = !search || [invoice.invoice_number, invoiceClientName(invoice), invoice.invoice_data?.email, invoice.invoice_data?.projectTitle].filter(Boolean).some((value) => String(value).toLowerCase().includes(search));
    return matchesStatus && matchesSearch;
  });
  return <><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold text-cyanbrand-600">Billing command center</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">Invoices</h1><p className="mt-2 text-slate-500">Create invoices from won CRM deals and manage billing from Finance.</p></div></div>{error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}<section className="mt-7 grid gap-4 md:grid-cols-3"><Metric label="Ready deals" value={readyDeals.length} note="Waiting for invoice"/><Metric label="Open receivables" value={money(openInvoices.reduce((sum, invoice) => sum + invoiceBalance(invoice), 0))} note={`${openInvoices.length} unpaid invoices`} tone="text-amber-600"/><Metric label="Paid invoices" value={paidInvoices.length} note={`${cancelledInvoices.length} cancelled in history`} tone="text-emerald-600"/></section><section className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]"><div className={panelClass}><div className="border-b border-slate-100 p-5"><h2 className="font-semibold text-ink">Ready to invoice</h2><p className="mt-1 text-sm text-slate-500">Won CRM leads that do not already have an invoice.</p></div><div className="divide-y divide-slate-100">{readyDeals.length ? readyDeals.map((deal) => <article className="p-5 transition hover:bg-slate-50/70" key={deal.id}><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold text-cyanbrand-600">{deal.service || 'Won deal'}</p><h3 className="mt-1 font-semibold text-ink">{deal.name}</h3><p className="mt-1 text-sm text-slate-500">{deal.company || deal.email || 'CRM handoff'}{deal.owner ? ` · ${deal.owner}` : ''}</p><p className="mt-2 text-lg font-bold text-ink">{money(deal.value)}</p></div><button className={primaryButton} onClick={() => onCreate(deal)} type="button">Create invoice</button></div></article>) : <EmptyState title="Ready queue is clear" note="Paid, cancelled, and already invoiced deals stay out of this list." />}</div></div><div className={panelClass}><div className="border-b border-slate-100 p-5"><h2 className="font-semibold text-ink">Invoice history</h2><p className="mt-1 text-sm text-slate-500">Payment, email, and cancellation controls are recorded in audit history.</p><div className="mt-4 grid gap-2 sm:grid-cols-[1fr_180px]"><input value={invoiceSearch} onChange={(event) => setInvoiceSearch(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium outline-none focus:border-cyanbrand-500" placeholder="Search invoice, client, email" /><select value={invoiceStatusFilter} onChange={(event) => setInvoiceStatusFilter(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-cyanbrand-500"><option value="all">All statuses</option><option value="issued">Issued</option><option value="paid">Paid</option><option value="cancelled">Cancelled</option><option value="draft">Draft</option></select></div></div><div className="divide-y divide-slate-100">{filteredInvoices.length ? filteredInvoices.map((item) => { const balance = invoiceBalance(item); const paid = Number(item.amount_paid_npr || 0); const itemPayments = payments.filter((payment) => payment.invoice_id === item.id); const latestEmail = (emails || []).filter((email) => email.invoice_id === item.id).sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0))[0]; return <article className="p-5 transition hover:bg-slate-50/70" key={item.id}><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold text-cyanbrand-600">{item.invoice_number}</p><h3 className="mt-1 font-semibold text-ink">{invoiceClientName(item)}</h3><p className="mt-1 text-sm text-slate-500">Due {item.due_date ? date(item.due_date) : 'not set'} · Paid {money(paid)} · Balance {money(balance)}</p>{latestEmail ? <p className="mt-1 text-xs font-semibold text-slate-400">Email {latestEmail.status} · {dateTime(latestEmail.sent_at || latestEmail.created_at)} · {latestEmail.to_email}</p> : null}</div><div className="flex flex-col items-start gap-2 sm:items-end"><p className="text-lg font-bold text-ink">{money(Number(item.amount_due_npr || 0))}</p><span className={`rounded-full px-3 py-1.5 text-xs font-bold ${invoiceStatusClass[item.status] || invoiceStatusClass.draft}`}>{item.status}</span></div></div>{itemPayments.length ? <div className="mt-4 rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Payment records</p><div className="mt-2 space-y-1">{itemPayments.slice(0, 3).map((payment) => <div className="flex items-center justify-between gap-3 text-xs" key={payment.id}><span className="truncate text-slate-500">{dateTime(payment.received_at)} · {paymentMethodLabels[payment.payment_method] || payment.payment_method}{payment.note ? ` · ${payment.note}` : ''}</span><span className="font-bold text-emerald-600">{money(Number(payment.amount_npr || 0))}</span></div>)}</div></div> : null}<div className="mt-4 flex flex-wrap gap-2"><button className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50" onClick={() => onEdit(item)} type="button">Edit PDF</button><button className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-700 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-40" disabled={item.status === 'cancelled'} onClick={() => onQueueEmail(item)} type="button">{latestEmail?.status === 'sent' ? 'Resend email' : 'Send email'}</button><button className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40" disabled={item.status === 'paid' || item.status === 'cancelled'} onClick={() => onPaymentReceived(item)} type="button">Record payment</button><button className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-bold text-amber-800 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40" disabled={item.status === 'cancelled' || item.status === 'paid'} onClick={() => onPaymentPending(item)} type="button">Pending</button><button className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40" disabled={item.status === 'cancelled' || item.status === 'paid'} onClick={() => onCancel(item)} type="button">Cancel invoice</button></div></article>; }) : <EmptyState title="No matching invoices" note="Adjust the status filter or search term." />}</div></div></section><section className={`mt-5 ${panelClass}`}><div className="flex flex-col gap-4 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="font-semibold text-ink">Invoice audit history</h2><p className="mt-1 text-sm text-slate-500">Choose one invoice to review its exact activity timeline.</p></div><select value={auditInvoiceId} onChange={(event) => setAuditInvoiceId(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-ink outline-none focus:border-cyanbrand-500 lg:w-80"><option value="">Select invoice number</option>{auditInvoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoice_number} - {invoiceClientName(invoice)}</option>)}</select></div><div className="max-h-[520px] divide-y divide-slate-100 overflow-y-auto">{auditInvoiceId ? selectedAuditEvents.length ? selectedAuditEvents.map((event) => <article className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between" key={event.id}><div><p className="font-semibold text-ink">{eventLabel[event.event_type] || event.event_type} · {event.invoice_number}</p><p className="mt-1 text-sm text-slate-500">{event.client_name} by {event.actor_name || event.actor_email || 'Finance'} on {dateTime(event.created_at)}</p>{event.note ? <p className="mt-1 text-xs font-medium text-slate-400">{event.note}</p> : null}</div><p className="font-bold text-ink">{money(Number(event.amount_npr || 0))}</p></article>) : <EmptyState title="No events for this invoice" note="New actions will appear here automatically." /> : <EmptyState title="Select an invoice" note="Audit history is grouped by invoice number so multiple bills stay easy to review." />}</div></section></>;
}

function PaymentModal({ invoice, onClose, onSave }) {
  const balance = invoiceBalance(invoice);
  const [form, setForm] = useState({ amount: balance ? String(balance) : '', method: 'bank_transfer', note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!amount || amount <= 0) {
      setError('Enter a payment amount.');
      return;
    }
    if (amount > balance) {
      setError(`Payment cannot be more than the balance ${money(balance)}.`);
      return;
    }
    setSaving(true);
    try {
      await onSave(invoice, { amount, method: form.method, note: form.note.trim() });
      onClose();
    } catch (paymentError) {
      setError(paymentError.message || 'Payment could not be recorded.');
    } finally {
      setSaving(false);
    }
  };
  return <div className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-4"><form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-bold text-cyanbrand-600">Record payment</p><h2 className="mt-1 text-2xl font-semibold text-ink">{invoice.invoice_number}</h2><p className="mt-1 text-sm text-slate-500">{invoiceClientName(invoice)} · Balance {money(balance)}</p></div><button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-500 hover:bg-slate-50">Close</button></div>{error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p> : null}<div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-xs font-bold uppercase tracking-wider text-slate-500">Amount received<input type="number" min="1" max={balance} value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold normal-case tracking-normal outline-none focus:border-cyanbrand-500" /></label><label className="text-xs font-bold uppercase tracking-wider text-slate-500">Payment method<select value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold normal-case tracking-normal outline-none focus:border-cyanbrand-500">{Object.entries(paymentMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs font-bold uppercase tracking-wider text-slate-500 sm:col-span-2">Internal note<textarea rows="3" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-medium normal-case tracking-normal outline-none focus:border-cyanbrand-500" placeholder="Receipt reference, bank account, or payment detail" /></label></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button><button type="submit" disabled={saving} className={primaryButton}>{saving ? 'Recording...' : 'Record payment'}</button></div></form></div>;
}

function Expenses({ rows, onAdd, error }) {
  const [form, setForm] = useState({ company: '', purpose: '', category: 'Software', amount: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [expenseFilter, setExpenseFilter] = useState('all');
  const expenses = rows.filter((row) => row.type === 'expense' && row.status !== 'Void');
  const expenseCategories = Array.from(new Set(expenses.map((row) => row.category))).sort();
  const visibleExpenses = expenseFilter === 'all' ? expenses : expenses.filter((row) => row.category === expenseFilter);
  const byCategory = Object.entries(expenses.reduce((result, row) => ({ ...result, [row.category]: (result[row.category] || 0) + row.amount }), {})).sort((a, b) => b[1] - a[1]);
  const total = expenses.reduce((sum, row) => sum + row.amount, 0);
  const submit = async (event) => {
    event.preventDefault();
    if (!form.company.trim() || !form.purpose.trim() || !Number(form.amount)) return;
    setSaving(true);
    const description = `${form.purpose.trim()}${form.note.trim() ? ` - ${form.note.trim()}` : ''}`;
    const saved = await onAdd({ description, party: form.company, category: form.category, amount: form.amount, type: 'expense' });
    if (saved) setForm({ company: '', purpose: '', category: 'Software', amount: '', note: '' });
    setSaving(false);
  };
  return <><div><h1 className="text-3xl font-semibold tracking-tight text-ink">Expenses</h1><p className="mt-2 text-slate-500">Record operating spend by company, purpose, category, and amount.</p></div><form onSubmit={submit} className="mt-7 grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 md:grid-cols-2 xl:grid-cols-6"><label className="text-xs font-bold uppercase tracking-wider text-slate-500 xl:col-span-2">Company or vendor<input value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium normal-case tracking-normal outline-none focus:border-cyanbrand-500" placeholder="Company paid" /></label><label className="text-xs font-bold uppercase tracking-wider text-slate-500 xl:col-span-2">Expense for<input value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium normal-case tracking-normal outline-none focus:border-cyanbrand-500" placeholder="What this expense was for" /></label><label className="text-xs font-bold uppercase tracking-wider text-slate-500">Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm normal-case"><option value="Software">Software</option><option value="Hosting">Hosting</option><option value="Marketing">Marketing</option><option value="Office">Office</option><option value="Travel">Travel</option><option value="Contractor">Contractor</option><option value="Operations">Operations</option><option value="Other">Other</option></select></label><label className="text-xs font-bold uppercase tracking-wider text-slate-500">Amount (Rs)<input type="number" min="0" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium normal-case tracking-normal outline-none focus:border-cyanbrand-500" /></label><label className="text-xs font-bold uppercase tracking-wider text-slate-500 md:col-span-2 xl:col-span-5">Internal note<input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium normal-case tracking-normal outline-none focus:border-cyanbrand-500" placeholder="Optional note" /></label><button disabled={saving} className="self-end rounded-xl bg-cyanbrand-500 px-4 py-3 text-sm font-bold text-ink disabled:opacity-60">{saving ? 'Saving...' : 'Record expense'}</button></form>{error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}<section className="mt-7 grid gap-4 md:grid-cols-3"><Metric label="Total expenses" value={money(total)} note={`${expenses.length} recorded entries`} /><Metric label="Top category" value={byCategory[0]?.[0] || 'None'} note={byCategory[0] ? money(byCategory[0][1]) : 'No spend yet'} tone="text-amber-600" /><Metric label="Cleared" value={expenses.filter((row) => row.status === 'Cleared').length} note="Posted expenses" tone="text-emerald-600" /></section><div className="mt-5 flex justify-end"><select value={expenseFilter} onChange={(event) => setExpenseFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-ink outline-none focus:border-cyanbrand-500"><option value="all">All expense categories</option>{expenseCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></div><section className="mt-5 grid gap-5 xl:grid-cols-[0.8fr_1.2fr]"><div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-semibold text-ink">Spend by category</h2><div className="mt-5 space-y-3">{byCategory.length ? byCategory.map(([category, amount]) => <div key={category}><div className="mb-1 flex justify-between text-sm"><span className="font-semibold text-slate-600">{category}</span><span className="font-bold text-ink">{money(amount)}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-cyanbrand-500" style={{ width: `${Math.max((amount / Math.max(total, 1)) * 100, 6)}%` }} /></div></div>) : <p className="py-8 text-center text-sm text-slate-500">No expenses recorded yet.</p>}</div></div><div className="rounded-2xl border border-slate-200 bg-white">{visibleExpenses.length ? <TransactionTable rows={visibleExpenses.slice(0, 12)} /> : <p className="p-8 text-center text-sm text-slate-500">No expenses match this filter.</p>}</div></section></>;
}

function Payroll({ rows, teamMembers, events, onAdd, onUpdate, onDelete, error }) {
  const emptyForm = { payee: '', period: '', category: 'Payroll', amount: '', note: '' };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [saving, setSaving] = useState(false);
  const [payrollSearch, setPayrollSearch] = useState('');
  const payrollRows = rows.filter(isPayrollRow);
  const voidedPayrollRows = rows.filter((row) => isPayrollLike(row) && row.status === 'Void');
  const total = payrollRows.reduce((sum, row) => sum + row.amount, 0);
  const payrollEvents = (events || []).slice(0, 12);
  const visiblePayrollRows = payrollRows.filter((row) => {
    const search = payrollSearch.trim().toLowerCase();
    return !search || [row.party, row.description, row.category].filter(Boolean).some((value) => String(value).toLowerCase().includes(search));
  });
  const resetForm = () => {
    setForm(emptyForm);
    setEditingId('');
  };
  const editRow = (row) => {
    const parts = row.description.split(' - ');
    const hasCategoryPrefix = parts[0] === row.category;
    setEditingId(row.id);
    setForm({
      payee: row.party || '',
      period: hasCategoryPrefix ? parts[1] || '' : '',
      category: row.category || 'Payroll',
      amount: String(row.amount || ''),
      note: hasCategoryPrefix ? parts.slice(2).join(' - ') : row.description
    });
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!form.payee.trim() || !Number(form.amount)) return;
    setSaving(true);
    const description = `${form.category}${form.period ? ` - ${form.period}` : ''}${form.note ? ` - ${form.note}` : ''}`;
    const payload = { description, party: form.payee, category: form.category, amount: form.amount, type: 'expense' };
    const saved = editingId ? await onUpdate(editingId, payload) : await onAdd(payload);
    if (saved) resetForm();
    setSaving(false);
  };
  return <><div><h1 className="text-3xl font-semibold tracking-tight text-ink">Payroll</h1><p className="mt-2 text-slate-500">Record salary, contractor, and benefit payments without mixing payroll into the client/vendor transaction form.</p></div><section className="mt-7 grid gap-4 md:grid-cols-3"><Metric label="Payroll paid" value={money(total)} note={`${payrollRows.length} active payroll entries`} tone="text-emerald-600" /><Metric label="Next cycle" value="Monthly" note="Post payroll below" /><Metric label="Voided records" value={voidedPayrollRows.length} note="Kept only in Payroll history" tone="text-amber-600" /></section><form onSubmit={submit} className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 md:grid-cols-2 xl:grid-cols-6"><label className="text-xs font-bold uppercase tracking-wider text-slate-500 xl:col-span-2">Employee or contractor<select value={form.payee} onChange={(event) => setForm({ ...form, payee: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium normal-case tracking-normal outline-none focus:border-cyanbrand-500"><option value="">Select team member</option>{teamMembers.map((member) => <option key={member.user_id || member.email || member.name} value={member.name}>{member.name}{member.role ? ` - ${member.role}` : ''}</option>)}</select></label><label className="text-xs font-bold uppercase tracking-wider text-slate-500">Pay period<input value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium normal-case tracking-normal outline-none focus:border-cyanbrand-500" placeholder="June 2026" /></label><label className="text-xs font-bold uppercase tracking-wider text-slate-500">Payroll type<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm normal-case"><option value="Payroll">Salary</option><option value="Contractor">Contractor</option><option value="Benefits">Benefits</option><option value="Bonus">Bonus</option></select></label><label className="text-xs font-bold uppercase tracking-wider text-slate-500">Amount (Rs)<input type="number" min="0" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium normal-case tracking-normal outline-none focus:border-cyanbrand-500" /></label><div className="flex items-end gap-2"><button disabled={saving || !teamMembers.length} className="w-full rounded-xl bg-cyanbrand-500 px-4 py-3 text-sm font-bold text-ink disabled:opacity-60">{saving ? 'Saving...' : editingId ? 'Save changes' : 'Record payroll'}</button>{editingId ? <button type="button" onClick={resetForm} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button> : null}</div><label className="text-xs font-bold uppercase tracking-wider text-slate-500 md:col-span-2 xl:col-span-6">Internal note<input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium normal-case tracking-normal outline-none focus:border-cyanbrand-500" placeholder="Optional payroll note" /></label></form><div className="mt-4 flex justify-end"><input value={payrollSearch} onChange={(event) => setPayrollSearch(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium outline-none focus:border-cyanbrand-500 sm:w-80" placeholder="Filter payroll by team member or period" /></div>{!teamMembers.length ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-800">No approved team members are available for payroll yet.</p> : null}{error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}<section className="mt-5 rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 p-5"><h2 className="font-semibold text-ink">Payroll activity</h2><p className="mt-1 text-sm text-slate-500">Edit mistakes or void test entries without erasing the financial trail.</p></div>{visiblePayrollRows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="text-xs uppercase tracking-wider text-slate-400">{['Date','Employee','Payroll detail','Status','Amount','Actions'].map((heading) => <th key={heading} className="px-5 py-3 font-bold">{heading}</th>)}</tr></thead><tbody>{visiblePayrollRows.map((row) => <tr key={row.id} className="border-t border-slate-100 text-sm"><td className="whitespace-nowrap px-5 py-4 text-slate-500">{date(row.date)}</td><td className="px-5 py-4 font-semibold text-ink">{row.party}</td><td className="px-5 py-4"><p className="font-semibold text-ink">{row.description}</p><p className="mt-1 text-xs text-slate-400">{row.category}</p></td><td className="px-5 py-4"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{row.status}</span></td><td className="px-5 py-4 text-right font-bold text-ink">{money(row.amount)}</td><td className="px-5 py-4"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => editRow(row)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Edit</button><button type="button" onClick={() => onDelete(row)} className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100">Delete</button></div></td></tr>)}</tbody></table></div> : <p className="p-8 text-center text-sm text-slate-500">No payroll entries match this view.</p>}</section><section className="mt-5 rounded-2xl border border-slate-200 bg-white"><div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-ink">Payroll audit history</h2><p className="mt-1 text-sm text-slate-500">Create, edit, and void actions with actor and timestamp.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">Latest {payrollEvents.length}</span></div>{payrollEvents.length ? <div className="divide-y divide-slate-100">{payrollEvents.map((event) => <article key={event.id} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-ink"><span className="capitalize">{event.event_type.replace('_', ' ')}</span> · {event.payee_name || 'Team member'}</p><p className="mt-1 text-sm text-slate-500">{event.payroll_detail || 'Payroll entry'} · {event.actor_name || event.actor_email || 'Finance team'} · {dateTime(event.created_at)}</p>{event.note ? <p className="mt-1 text-xs text-slate-400">{event.note}</p> : null}</div><p className="font-bold text-ink">{money(Number(event.amount_npr || 0))}</p></article>)}</div> : <p className="p-8 text-center text-sm text-slate-500">Payroll audit entries will appear after the next payroll action.</p>}</section>{voidedPayrollRows.length ? <section className="mt-5 rounded-2xl border border-amber-100 bg-amber-50/40"><div className="border-b border-amber-100 p-5"><h2 className="font-semibold text-ink">Voided payroll history</h2><p className="mt-1 text-sm text-slate-500">These records are hidden from Transactions, Overview, Expenses, and Reports.</p></div><div className="divide-y divide-amber-100">{voidedPayrollRows.slice(0, 10).map((row) => <article key={row.id} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-ink">{row.description}</p><p className="mt-1 text-sm text-slate-500">{row.party || 'Team member'} · {date(row.date)}</p></div><p className="font-bold text-amber-700">Voided {money(row.amount)}</p></article>)}</div></section> : null}</>;
}

function Reports({ rows, invoices }) {
  const activeRows = rows.filter((row) => row.status !== 'Void');
  const totals = activeRows.reduce((sum, row) => ({ ...sum, [row.type]: sum[row.type] + row.amount }), { income: 0, expense: 0 });
  const net = totals.income - totals.expense;
  const receivable = invoices.filter((invoice) => invoice.status !== 'paid' && invoice.status !== 'cancelled').reduce((sum, invoice) => sum + Number(invoice.amount_due_npr || 0), 0);
  const categories = Object.entries(activeRows.reduce((result, row) => ({ ...result, [row.category]: (result[row.category] || 0) + (row.type === 'income' ? row.amount : -row.amount) }), {})).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  return <><h1 className="text-3xl font-semibold tracking-tight text-ink">Reports</h1><p className="mt-2 text-slate-500">A working snapshot of revenue, expenses, net position, and receivables.</p><section className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Metric label="Income" value={money(totals.income)} note="Posted income" tone="text-emerald-600" /><Metric label="Expenses" value={money(totals.expense)} note="Posted expenses" tone="text-amber-600" /><Metric label="Net" value={money(net)} note={net >= 0 ? 'Positive position' : 'Needs review'} tone={net >= 0 ? 'text-emerald-600' : 'text-rose-600'} /><Metric label="Receivables" value={money(receivable)} note="Open invoice amount" /></section><section className="mt-5 grid gap-5 xl:grid-cols-[1fr_1fr]"><div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-semibold text-ink">Category movement</h2><div className="mt-5 space-y-3">{categories.length ? categories.slice(0, 8).map(([category, amount]) => <div className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0" key={category}><span className="font-semibold text-slate-600">{category}</span><span className={`font-bold ${amount >= 0 ? 'text-emerald-600' : 'text-ink'}`}>{amount >= 0 ? '+' : '−'}{money(Math.abs(amount))}</span></div>) : <p className="py-8 text-center text-sm text-slate-500">No report data yet.</p>}</div></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-semibold text-ink">Billing status</h2><div className="mt-5 space-y-3">{['draft', 'issued', 'paid', 'cancelled'].map((status) => { const matching = invoices.filter((invoice) => invoice.status === status); return <div className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0" key={status}><span className="capitalize font-semibold text-slate-600">{status}</span><span className="font-bold text-ink">{matching.length}</span></div>; })}</div></div></section></>;
}

export default function FinanceApp({ profile, signOut }) {
  const [page, setPage] = useState('Overview');
  const [activeProfile, setActiveProfile] = useState(profile);
  const [rows, setRows] = useState([]);
  const [deals, setDeals] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [invoiceEvents, setInvoiceEvents] = useState([]);
  const [invoicePayments, setInvoicePayments] = useState([]);
  const [invoiceEmails, setInvoiceEmails] = useState([]);
  const [payrollEvents, setPayrollEvents] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [invoiceModal, setInvoiceModal] = useState(null);
  const [paymentModal, setPaymentModal] = useState(null);
  const [dataError, setDataError] = useState('');
  useEffect(() => {
    supabase.from('finance_transactions').select('*').order('transaction_date', { ascending: false }).order('created_at', { ascending: false }).then(({ data, error }) => {
      if (error) { setDataError(error.message); return; }
      setRows((data || []).map(mapTransaction));
    });
    Promise.all([
      supabase.from('finance_deals').select('*').order('won_at', { ascending: false }),
      supabase.from('finance_invoices').select('*').order('created_at', { ascending: false }),
      supabase.from('finance_invoice_events').select('*').order('created_at', { ascending: false }),
      supabase.from('finance_invoice_payments').select('*').order('received_at', { ascending: false }),
      supabase.from('finance_payroll_events').select('*').order('created_at', { ascending: false }),
      supabase.from('finance_invoice_emails').select('*').order('created_at', { ascending: false }),
      supabase.from('team_members').select('user_id, name, email, role').order('name', { ascending: true })
    ]).then(([dealResult, invoiceResult, eventResult, paymentResult, payrollEventResult, emailResult, teamResult]) => {
      if (dealResult.error || invoiceResult.error || eventResult.error || teamResult.error) {
        setDataError(dealResult.error?.message || invoiceResult.error?.message || eventResult.error?.message || teamResult.error?.message);
        return;
      }
      setDeals((dealResult.data || []).map(mapFinanceDeal));
      setInvoices(invoiceResult.data || []);
      setInvoiceEvents(eventResult.data || []);
      if (paymentResult.error) {
        if (!isMissingInvoicePaymentsTable(paymentResult.error)) setDataError(paymentResult.error.message);
        setInvoicePayments([]);
      } else {
        setInvoicePayments(paymentResult.data || []);
      }
      if (payrollEventResult.error) {
        if (!isMissingPayrollEventsTable(payrollEventResult.error)) setDataError(payrollEventResult.error.message);
        setPayrollEvents([]);
      } else {
        setPayrollEvents(payrollEventResult.data || []);
      }
      if (emailResult.error) {
        if (!isMissingOptionalTable(emailResult.error, 'finance_invoice_emails')) setDataError(emailResult.error.message);
        setInvoiceEmails([]);
      } else {
        setInvoiceEmails(emailResult.data || []);
      }
      setTeamMembers(teamResult.data || []);
    });
    const channel = supabase
      .channel('finance-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_deals' }, (payload) => {
        setDeals((current) => {
          if (payload.eventType === 'DELETE') return current.filter((deal) => deal.id !== payload.old?.id);
          const incoming = mapFinanceDeal(payload.new);
          return [incoming, ...current.filter((deal) => deal.id !== incoming.id)].sort((left, right) => new Date(right.wonAt || 0) - new Date(left.wonAt || 0));
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_invoices' }, (payload) => {
        setInvoices((current) => {
          if (payload.eventType === 'DELETE') return current.filter((invoice) => invoice.id !== payload.old?.id);
          return [payload.new, ...current.filter((invoice) => invoice.id !== payload.new.id)].sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0));
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_transactions' }, (payload) => {
        setRows((current) => {
          if (payload.eventType === 'DELETE') return current.filter((row) => row.id !== payload.old?.id);
          const incoming = mapTransaction(payload.new);
          return [incoming, ...current.filter((row) => row.id !== incoming.id)].sort((left, right) => new Date(right.date || 0) - new Date(left.date || 0));
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_invoice_events' }, (payload) => {
        setInvoiceEvents((current) => {
          if (payload.eventType === 'DELETE') return current.filter((event) => event.id !== payload.old?.id);
          return [payload.new, ...current.filter((event) => event.id !== payload.new.id)].sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0));
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_invoice_payments' }, (payload) => {
        setInvoicePayments((current) => {
          if (payload.eventType === 'DELETE') return current.filter((payment) => payment.id !== payload.old?.id);
          return [payload.new, ...current.filter((payment) => payment.id !== payload.new.id)].sort((left, right) => new Date(right.received_at || 0) - new Date(left.received_at || 0));
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_payroll_events' }, (payload) => {
        setPayrollEvents((current) => {
          if (payload.eventType === 'DELETE') return current.filter((event) => event.id !== payload.old?.id);
          return [payload.new, ...current.filter((event) => event.id !== payload.new.id)].sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0));
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_invoice_emails' }, (payload) => {
        setInvoiceEmails((current) => {
          if (payload.eventType === 'DELETE') return current.filter((email) => email.id !== payload.old?.id);
          return [payload.new, ...current.filter((email) => email.id !== payload.new.id)].sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0));
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' }, (payload) => {
        setTeamMembers((current) => {
          if (payload.eventType === 'DELETE') return current.filter((member) => member.user_id !== payload.old?.user_id);
          return [payload.new, ...current.filter((member) => member.user_id !== payload.new.user_id)].sort((left, right) => (left.name || '').localeCompare(right.name || ''));
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);
  const auditPayroll = async (row, eventType, note = '', eventData = {}) => {
    const eventRecord = {
      transaction_id: row.id,
      event_type: eventType,
      actor_id: activeProfile.id,
      actor_name: activeProfile?.full_name || '',
      actor_email: activeProfile?.email || '',
      payee_name: row.party || '',
      payroll_detail: row.description || row.category || 'Payroll entry',
      amount_npr: Number(row.amount || 0),
      note,
      event_data: eventData
    };
    const { data, error } = await supabase.from('finance_payroll_events').insert(eventRecord).select().single();
    if (error) {
      if (!isMissingPayrollEventsTable(error)) setDataError(error.message);
      return null;
    }
    setPayrollEvents((current) => [data, ...current.filter((event) => event.id !== data.id)]);
    return data;
  };
  const addRow = async (form) => {
    setDataError('');
    const record = { transaction_date: new Date().toISOString().slice(0,10), description: form.description.trim(), party: form.party.trim() || null, category: form.category.trim(), transaction_type: form.type, amount_npr: Number(form.amount), status: 'cleared', created_by: activeProfile.id };
    const { data, error } = await supabase.from('finance_transactions').insert(record).select().single();
    if (error) { setDataError(error.message); return false; }
    const mapped = mapTransaction(data);
    setRows(current => [mapped, ...current.filter((row) => row.id !== mapped.id)]);
    if (isPayrollLike(mapped)) await auditPayroll(mapped, 'created', 'Payroll record created.');
    return true;
  };
  const updateRow = async (id, form) => {
    setDataError('');
    const record = { description: form.description.trim(), party: form.party.trim() || null, category: form.category.trim(), transaction_type: form.type, amount_npr: Number(form.amount) };
    const { data, error } = await supabase.from('finance_transactions').update(record).eq('id', id).select().single();
    if (error) { setDataError(error.message); return false; }
    const mapped = mapTransaction(data);
    setRows((current) => current.map((row) => row.id === id ? mapped : row));
    if (isPayrollLike(mapped)) await auditPayroll(mapped, 'updated', 'Payroll record updated.');
    return true;
  };
  const voidRow = async (row) => {
    const reason = window.prompt(`Void this payroll entry for ${row.party || 'this team member'}? Add a reason for audit history.`);
    if (reason === null) return false;
    setDataError('');
    const { data, error } = await supabase.from('finance_transactions').update({ status: 'void' }).eq('id', row.id).select().single();
    if (error) { setDataError(error.message); return false; }
    const mapped = mapTransaction(data);
    setRows((current) => current.map((item) => item.id === row.id ? mapped : item));
    await auditPayroll(mapped, 'voided', reason.trim() || 'Payroll entry voided and hidden from active financial views.');
    return true;
  };
  const auditInvoice = async (invoiceRow, eventType, note = '', amount = Number(invoiceRow.amount_due_npr || 0), eventData = {}) => {
    const eventRecord = {
      invoice_id: invoiceRow.id,
      event_type: eventType,
      actor_id: activeProfile.id,
      actor_name: activeProfile?.full_name || '',
      actor_email: activeProfile?.email || '',
      client_name: invoiceClientName(invoiceRow),
      invoice_number: invoiceRow.invoice_number,
      amount_npr: amount,
      note,
      event_data: eventData
    };
    const { data, error } = await supabase.from('finance_invoice_events').insert(eventRecord).select().single();
    if (error) {
      setDataError(error.message);
      throw error;
    }
    setInvoiceEvents((current) => [data, ...current.filter((event) => event.id !== data.id)]);
    return data;
  };
  const openInvoiceForDeal = (deal) => {
    const dealInvoices = invoices.filter((invoice) => invoice.crm_lead_id === deal.crmLeadId).map((invoice) => invoice.invoice_data);
    setInvoiceModal({ deal: { ...deal, invoices: dealInvoices }, invoice: null });
  };
  const editInvoice = (invoiceRow) => {
    const deal = deals.find((item) => item.crmLeadId === invoiceRow.crm_lead_id) || {
      id: invoiceRow.deal_id,
      crmLeadId: invoiceRow.crm_lead_id,
      name: invoiceRow.invoice_data?.clientName,
      company: invoiceRow.invoice_data?.company,
      email: invoiceRow.invoice_data?.email,
      phone: invoiceRow.invoice_data?.phone,
      service: invoiceRow.invoice_data?.projectTitle,
      value: Number(invoiceRow.grand_total_npr || 0),
      invoices: []
    };
    const dealInvoices = invoices.filter((invoice) => invoice.crm_lead_id === invoiceRow.crm_lead_id && invoice.id !== invoiceRow.id).map((invoice) => invoice.invoice_data);
    setInvoiceModal({ deal: { ...deal, invoices: dealInvoices }, invoice: invoiceRow.invoice_data });
  };
  const saveInvoice = async (invoice) => {
    if (!invoiceModal?.deal) return;
    const amountDue = Number(invoice.amountDue || 0);
    const existingInvoice = invoices.find((item) => item.id === invoice.id);
    const record = {
      id: invoice.id,
      deal_id: invoiceModal.deal.id,
      crm_lead_id: invoiceModal.deal.crmLeadId,
      invoice_number: invoice.invoiceNumber,
      status: invoice.status,
      amount_due_npr: amountDue,
      amount_paid_npr: invoice.status === 'paid' ? amountDue : Number(existingInvoice?.amount_paid_npr || 0),
      balance_due_npr: invoice.status === 'paid' || invoice.status === 'cancelled' ? 0 : amountDue,
      grand_total_npr: Number(invoice.grandTotal || 0),
      due_date: invoice.dueDate || null,
      invoice_data: invoice,
      created_by: activeProfile.id
    };
    const { data, error } = await supabase.from('finance_invoices').upsert(record, { onConflict: 'id' }).select().single();
    if (error) {
      setDataError(error.message);
      throw error;
    }
    setInvoices((current) => [data, ...current.filter((item) => item.id !== data.id)]);
    await auditInvoice(data, existingInvoice ? 'updated' : 'created', existingInvoice ? 'Invoice PDF details updated.' : 'Invoice generated in Finance.', amountDue);
    const { error: dealError } = await supabase.from('finance_deals').update({ status: invoice.status === 'paid' ? 'paid' : 'invoicing', updated_at: new Date().toISOString() }).eq('id', invoiceModal.deal.id);
    if (dealError) {
      setDataError(dealError.message);
      throw dealError;
    }
    setDeals((current) => current.map((deal) => deal.id === invoiceModal.deal.id ? { ...deal, status: invoice.status === 'paid' ? 'paid' : 'invoicing' } : deal));
  };
  const updateInvoiceRecord = async (invoiceRow, changes) => {
    const { data, error } = await supabase.from('finance_invoices').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', invoiceRow.id).select().single();
    if (error) {
      setDataError(error.message);
      throw error;
    }
    setInvoices((current) => [data, ...current.filter((item) => item.id !== data.id)]);
    return data;
  };
  const recordInvoicePayment = async (invoiceRow, payment) => {
    setDataError('');
    const amount = Number(payment.amount || 0);
    const previousPaid = Number(invoiceRow.amount_paid_npr || 0);
    const totalDue = Number(invoiceRow.amount_due_npr || 0);
    const nextPaid = Math.min(previousPaid + amount, totalDue);
    const nextBalance = Math.max(totalDue - nextPaid, 0);
    const updatedInvoice = await updateInvoiceRecord(invoiceRow, { status: nextBalance <= 0 ? 'paid' : 'issued', amount_paid_npr: nextPaid, balance_due_npr: nextBalance });
    const { data: paymentRow, error: paymentError } = await supabase.from('finance_invoice_payments').insert({
      invoice_id: invoiceRow.id,
      amount_npr: amount,
      payment_method: payment.method,
      note: payment.note,
      received_by: activeProfile.id
    }).select().single();
    if (paymentError) {
      setDataError(paymentError.message);
      throw paymentError;
    }
    setInvoicePayments((current) => [paymentRow, ...current.filter((item) => item.id !== paymentRow.id)]);
    await auditInvoice(updatedInvoice, 'payment_received', `${nextBalance <= 0 ? 'Full' : 'Partial'} payment recorded${payment.note ? `: ${payment.note}` : '.'}`, amount, { payment_id: paymentRow.id, method: payment.method, balance_due_npr: nextBalance });
    const deal = deals.find((item) => item.id === invoiceRow.deal_id);
    const nextDealStatus = nextBalance <= 0 ? 'paid' : 'invoicing';
    if (deal) await supabase.from('finance_deals').update({ status: nextDealStatus, updated_at: new Date().toISOString() }).eq('id', deal.id);
    if (deal) setDeals((current) => current.map((item) => item.id === deal.id ? { ...item, status: nextDealStatus } : item));
    const transaction = {
      transaction_date: new Date().toISOString().slice(0, 10),
      description: `Payment received - ${invoiceRow.invoice_number}`,
      party: invoiceClientName(invoiceRow),
      category: 'Invoice payment',
      transaction_type: 'income',
      amount_npr: amount,
      status: 'cleared',
      created_by: activeProfile.id
    };
    const { data, error } = await supabase.from('finance_transactions').insert(transaction).select().single();
    if (error) {
      setDataError(error.message);
      throw error;
    }
    setRows((current) => [mapTransaction(data), ...current.filter((row) => row.id !== data.id)]);
  };
  const markPaymentPending = async (invoiceRow) => {
    setDataError('');
    const amount = Number(invoiceRow.amount_due_npr || 0);
    const paid = Number(invoiceRow.amount_paid_npr || 0);
    const balance = Math.max(amount - paid, 0);
    const updatedInvoice = await updateInvoiceRecord(invoiceRow, { status: balance <= 0 ? 'paid' : 'issued', amount_paid_npr: paid, balance_due_npr: balance });
    await auditInvoice(updatedInvoice, 'payment_pending', 'Payment marked as pending.', balance);
    const deal = deals.find((item) => item.id === invoiceRow.deal_id);
    if (deal) {
      const { error } = await supabase.from('finance_deals').update({ status: 'invoicing', updated_at: new Date().toISOString() }).eq('id', deal.id);
      if (error) {
        setDataError(error.message);
        throw error;
      }
      setDeals((current) => current.map((item) => item.id === deal.id ? { ...item, status: 'invoicing' } : item));
    }
  };
  const cancelInvoice = async (invoiceRow) => {
    const reason = window.prompt(`Cancel ${invoiceRow.invoice_number}? Add a cancellation reason for audit history.`);
    if (reason === null) return;
    setDataError('');
    const amount = invoiceBalance(invoiceRow);
    const updatedInvoice = await updateInvoiceRecord(invoiceRow, { status: 'cancelled', balance_due_npr: 0 });
    await auditInvoice(updatedInvoice, 'cancelled', reason.trim() || `Cancelled bill for ${invoiceClientName(invoiceRow)}.`, amount);
    const deal = deals.find((item) => item.id === invoiceRow.deal_id);
    if (deal) {
      const { error } = await supabase.from('finance_deals').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', deal.id);
      if (error) {
        setDataError(error.message);
        throw error;
      }
      setDeals((current) => current.map((item) => item.id === deal.id ? { ...item, status: 'archived' } : item));
    }
  };
  const queueInvoiceEmail = async (invoiceRow) => {
    setDataError('');
    const toEmail = invoiceRow.invoice_data?.email || '';
    if (!toEmail) {
      setDataError('This invoice has no client email from the CRM lead.');
      return;
    }
    const ownerEmail = deals.find((deal) => deal.id === invoiceRow.deal_id || deal.crmLeadId === invoiceRow.crm_lead_id)?.ownerEmail || invoiceRow.invoice_data?.ownerEmail || '';
    const subject = `YalaByte invoice ${invoiceRow.invoice_number}`;
    const body = `Hello ${invoiceRow.invoice_data?.clientName || invoiceClientName(invoiceRow)},\n\nPlease find attached your YalaByte invoice ${invoiceRow.invoice_number}.\n\nAmount due: ${money(Number(invoiceRow.amount_due_npr || 0))}\nDue date: ${invoiceRow.due_date ? date(invoiceRow.due_date) : 'Not set'}`;
    const attachment = await generateInvoicePdfAttachment(invoiceRow.invoice_data);
    const emailRecord = { invoice_id: invoiceRow.id, to_email: toEmail, cc_email: ownerEmail, subject, body, attachment_filename: attachment.filename, attachment_base64: attachment.base64, created_by: activeProfile.id };
    const { data, error } = await supabase.from('finance_invoice_emails').insert(emailRecord).select().single();
    if (error) {
      setDataError(error.message);
      throw error;
    }
    setInvoiceEmails((current) => [data, ...current.filter((email) => email.id !== data.id)]);
    await auditInvoice(invoiceRow, 'email_queued', `Email queued to ${toEmail}${ownerEmail ? ` with CC ${ownerEmail}` : ''}.`, Number(invoiceRow.amount_due_npr || 0), emailRecord);
    const { error: sendError } = await supabase.functions.invoke('send-invoice-email', { body: { emailId: data.id } });
    if (sendError) setDataError(`Email queued, but send failed: ${await functionErrorMessage(sendError)}`);
  };
  const initials = (activeProfile?.full_name || activeProfile?.email || 'YB').split(/\s|@/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase();
  const firstName = (activeProfile?.full_name || activeProfile?.email || 'Team').split(/\s|@/)[0];
  const financeUser = { name: activeProfile?.full_name || activeProfile?.email || 'Finance team', email: activeProfile?.email || '' };
  const todayLabel = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date());
  return <div className="min-h-screen bg-[#eef4f7] lg:flex"><aside className="fixed inset-y-0 hidden w-64 flex-col bg-ink px-4 py-6 text-white lg:flex"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-xl bg-white p-2 shadow-[0_14px_34px_rgba(19,200,222,0.18)]"><img src="/images/yalabyte-yb-logo.png" alt="YalaByte" className="h-full w-full object-contain"/></span><div><p className="font-bold">FinByte</p><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyanbrand-400">Finance OS</p></div></div><p className="mt-8 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Workspace</p><nav className="mt-3 space-y-1">{nav.map(item => <button key={item} onClick={()=>setPage(item)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${page===item?'bg-cyanbrand-500 text-ink shadow-[0_14px_34px_rgba(19,200,222,0.22)]':'text-slate-300 hover:bg-white/5 hover:text-white'}`}><Icon name={item} active={page===item}/>{item}</button>)}</nav><div className="mt-auto rounded-xl border border-white/10 bg-white/[0.03] p-3"><p className="truncate text-sm font-semibold">{activeProfile?.full_name || activeProfile?.email}</p><p className="mt-1 capitalize text-xs text-cyanbrand-400">{activeProfile?.role}</p><button onClick={signOut} className="mt-3 text-xs font-semibold text-slate-400 hover:text-white">Sign out</button></div></aside><main className="w-full lg:ml-64"><header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:px-8"><div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white p-2 shadow-sm ring-1 ring-slate-200 lg:hidden"><img src="/images/yalabyte-yb-logo.png" alt="YalaByte" className="h-full w-full object-contain"/></span><div className="hidden min-w-0 lg:block"><p className="text-xs font-bold uppercase tracking-[0.16em] text-cyanbrand-600">FinByte</p><p className="mt-0.5 text-sm font-medium text-slate-500">{todayLabel}</p></div><div className="flex gap-2 overflow-x-auto lg:hidden">{nav.map(item=><button key={item} onClick={()=>setPage(item)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold ${page===item?'bg-ink text-white':'bg-white text-slate-600 shadow-sm ring-1 ring-slate-200'}`}>{item}</button>)}</div></div><div className="ml-auto flex items-center gap-3"><div className="hidden text-right sm:block"><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Welcome back</p><p className="text-sm font-extrabold text-ink">{firstName}</p></div><ProfileMenu profile={activeProfile} initials={initials} onSaved={setActiveProfile} signOut={signOut} /></div></header><div className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">{page==='Overview'?<Overview transactions={rows} invoices={invoices} onNavigate={setPage} name={firstName}/>:page==='Transactions'?<Transactions rows={rows} onAdd={addRow} error={dataError}/>:page==='Invoices'?<Invoices deals={deals} invoices={invoices} events={invoiceEvents} payments={invoicePayments} emails={invoiceEmails} onCreate={openInvoiceForDeal} onEdit={editInvoice} onPaymentReceived={setPaymentModal} onPaymentPending={markPaymentPending} onCancel={cancelInvoice} onQueueEmail={queueInvoiceEmail} error={dataError}/>:page==='Expenses'?<Expenses rows={rows} onAdd={addRow} error={dataError}/>:page==='Payroll'?<Payroll rows={rows} teamMembers={teamMembers} events={payrollEvents} onAdd={addRow} onUpdate={updateRow} onDelete={voidRow} error={dataError}/>:page==='Reports'?<Reports rows={rows} invoices={invoices}/>:null}</div>{invoiceModal ? <InvoiceModal currentUser={financeUser} invoice={invoiceModal.invoice} lead={invoiceModal.deal} onClose={() => setInvoiceModal(null)} onSaved={saveInvoice} /> : null}{paymentModal ? <PaymentModal invoice={paymentModal} onClose={() => setPaymentModal(null)} onSave={recordInvoicePayment} /> : null}</main></div>;
}
