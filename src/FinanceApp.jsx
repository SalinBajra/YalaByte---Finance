import { useEffect, useMemo, useState } from 'react';
import InvoiceModal from './InvoiceModal';
import { supabase } from './lib/supabase';

const nav = ['Overview', 'Transactions', 'Invoices', 'Expenses', 'Payroll', 'Reports'];
const money = (value) => `Rs ${new Intl.NumberFormat('en-NP', { maximumFractionDigits: 0 }).format(value)}`;
const date = (value) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));

function Icon({ name }) {
  const icons = { Overview: '⌂', Transactions: '↔', Invoices: '▤', Expenses: '↓', Payroll: '◉', Reports: '⌁' };
  return <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/5 text-sm text-cyanbrand-400">{icons[name]}</span>;
}

function Metric({ label, value, note, tone = 'text-ink' }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p><p className={`mt-3 text-3xl font-semibold tracking-tight ${tone}`}>{value}</p><p className="mt-2 text-sm text-slate-500">{note}</p></article>;
}

function Overview({ transactions, invoices, onNavigate, name }) {
  const totals = useMemo(() => transactions.reduce((sum, item) => ({ ...sum, [item.type]: sum[item.type] + item.amount }), { income: 0, expense: 0 }), [transactions]);
  const receivable = invoices.filter((item) => item.status !== 'paid' && item.status !== 'cancelled').reduce((sum, item) => sum + Number(item.amount_due_npr || 0), 0);
  return <>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold text-cyanbrand-600">Finance workspace</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">Good afternoon, {name}.</h1><p className="mt-2 text-slate-500">Here is the financial pulse of YalaByte today.</p></div><button onClick={() => onNavigate('Transactions')} className="rounded-xl bg-cyanbrand-500 px-4 py-3 text-sm font-bold text-ink hover:bg-cyanbrand-400">+ Add transaction</button></div>
    <section className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Metric label="Cash position" value={money(24840)} note="Across operating accounts"/><Metric label="Income this month" value={money(totals.income)} note="+18% from last month" tone="text-emerald-600"/><Metric label="Expenses this month" value={money(totals.expense)} note="Within monthly budget"/><Metric label="Receivables" value={money(receivable)} note="2 open invoices" tone="text-amber-600"/></section>
    <section className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold text-ink">Cash flow</h2><p className="mt-1 text-sm text-slate-500">Six-month operating trend</p></div><span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">Jan – Jun 2026</span></div><div className="mt-8 flex h-52 items-end gap-3 border-b border-slate-200 px-2">{[42,58,49,70,62,86].map((height, i) => <div key={i} className="flex flex-1 items-end justify-center gap-1"><div className="w-1/2 rounded-t-md bg-cyanbrand-500" style={{height:`${height}%`}}/><div className="w-1/2 rounded-t-md bg-slate-200" style={{height:`${Math.max(22,height-25)}%`}}/></div>)}</div><div className="mt-3 grid grid-cols-6 text-center text-xs font-semibold text-slate-400">{['Jan','Feb','Mar','Apr','May','Jun'].map(m => <span key={m}>{m}</span>)}</div></div>
      <div className="rounded-2xl bg-ink p-5 text-white"><p className="text-sm font-semibold text-cyanbrand-400">June budget</p><p className="mt-3 text-3xl font-semibold">74% used</p><div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[74%] rounded-full bg-cyanbrand-500"/></div><div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-5"><div><p className="text-xs text-slate-400">Spent</p><p className="mt-1 font-semibold">{money(9830)}</p></div><div><p className="text-xs text-slate-400">Remaining</p><p className="mt-1 font-semibold">{money(3450)}</p></div></div><button onClick={() => onNavigate('Expenses')} className="mt-6 w-full rounded-xl border border-white/15 px-4 py-3 text-sm font-bold hover:bg-white/5">Review expenses</button></div>
    </section>
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h2 className="font-semibold text-ink">Recent activity</h2><p className="mt-1 text-sm text-slate-500">Latest money in and out</p></div><button onClick={() => onNavigate('Transactions')} className="text-sm font-bold text-cyanbrand-600">View all</button></div><TransactionTable rows={transactions.slice(0,4)}/></section>
  </>;
}

function TransactionTable({ rows }) { return <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left"><thead><tr className="text-xs uppercase tracking-wider text-slate-400">{['Date','Description','Category','Status','Amount'].map(h => <th key={h} className="px-5 py-3 font-bold">{h}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t border-slate-100 text-sm"><td className="whitespace-nowrap px-5 py-4 text-slate-500">{date(row.date)}</td><td className="px-5 py-4"><p className="font-semibold text-ink">{row.description}</p><p className="mt-1 text-xs text-slate-400">{row.party}</p></td><td className="px-5 py-4 text-slate-500">{row.category}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${row.status === 'Cleared' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{row.status}</span></td><td className={`px-5 py-4 text-right font-bold ${row.type === 'income' ? 'text-emerald-600' : 'text-ink'}`}>{row.type === 'income' ? '+' : '−'}{money(row.amount)}</td></tr>)}</tbody></table></div>; }

function Transactions({ rows, onAdd, error }) {
  const [form, setForm] = useState({ description: '', party: '', category: 'Software', amount: '', type: 'expense' });
  const [saving, setSaving] = useState(false);
  const submit = async (e) => { e.preventDefault(); if (!form.description || !Number(form.amount)) return; setSaving(true); const saved = await onAdd(form); if (saved) setForm({ description: '', party: '', category: 'Software', amount: '', type: 'expense' }); setSaving(false); };
  return <><h1 className="text-3xl font-semibold tracking-tight text-ink">Transactions</h1><p className="mt-2 text-slate-500">Record and review every movement of money in Nepali rupees.</p><form onSubmit={submit} className="mt-7 grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 md:grid-cols-2 xl:grid-cols-6">{[['description','Description'],['party','Vendor or client'],['category','Category'],['amount','Amount (Rs)']].map(([key,label]) => <label key={key} className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}<input type={key === 'amount' ? 'number' : 'text'} min={key === 'amount' ? '0' : undefined} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium normal-case tracking-normal outline-none focus:border-cyanbrand-500"/></label>)}<label className="text-xs font-bold uppercase tracking-wider text-slate-500">Type<select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm normal-case"><option value="expense">Expense</option><option value="income">Income</option></select></label><button disabled={saving} className="self-end rounded-xl bg-cyanbrand-500 px-4 py-3 text-sm font-bold text-ink disabled:opacity-60">{saving ? 'Saving…' : 'Add entry'}</button></form>{error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}<div className="mt-5 rounded-2xl border border-slate-200 bg-white">{rows.length ? <TransactionTable rows={rows}/> : <p className="p-8 text-center text-sm text-slate-500">No transactions yet. Add the first entry above.</p>}</div></>;
}

function Invoices({ deals, invoices, onCreate, onEdit, error }) {
  const readyDeals = deals.filter((deal) => deal.status !== 'archived');
  return <><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-semibold tracking-tight text-ink">Invoices</h1><p className="mt-2 text-slate-500">Create invoices from won CRM deals and manage billing from Finance.</p></div></div>{error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}<section className="mt-7 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]"><div className="rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 p-5"><h2 className="font-semibold text-ink">Ready to invoice</h2><p className="mt-1 text-sm text-slate-500">Won CRM leads waiting for Finance action.</p></div><div className="divide-y divide-slate-100">{readyDeals.length ? readyDeals.map((deal) => <article className="p-5" key={deal.id}><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold text-cyanbrand-600">{deal.service || 'Won deal'}</p><h3 className="mt-1 font-semibold text-ink">{deal.name}</h3><p className="mt-1 text-sm text-slate-500">{deal.company || deal.email || 'CRM handoff'}{deal.owner ? ` · ${deal.owner}` : ''}</p><p className="mt-2 text-lg font-bold text-ink">{money(deal.value)}</p></div><button className="rounded-xl bg-cyanbrand-500 px-4 py-2.5 text-sm font-bold text-ink hover:bg-cyanbrand-400" onClick={() => onCreate(deal)} type="button">Create invoice</button></div></article>) : <p className="p-8 text-center text-sm text-slate-500">No won CRM deals are waiting right now.</p>}</div></div><div className="rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 p-5"><h2 className="font-semibold text-ink">Invoice history</h2><p className="mt-1 text-sm text-slate-500">Saved PDFs and billing statuses.</p></div><div className="divide-y divide-slate-100">{invoices.length ? invoices.map((item) => <button className="flex w-full flex-col gap-3 p-5 text-left hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between" key={item.id} onClick={() => onEdit(item)} type="button"><div><p className="text-xs font-bold text-cyanbrand-600">{item.invoice_number}</p><h3 className="mt-1 font-semibold text-ink">{item.invoice_data?.company || item.invoice_data?.clientName || 'Client'}</h3><p className="mt-1 text-sm text-slate-500">Due {item.due_date ? date(item.due_date) : 'not set'}</p></div><div className="flex items-center gap-5"><p className="text-lg font-bold text-ink">{money(Number(item.amount_due_npr || 0))}</p><span className={`rounded-full px-3 py-1.5 text-xs font-bold ${item.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : item.status === 'issued' ? 'bg-cyan-50 text-cyan-700' : item.status === 'cancelled' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{item.status}</span></div></button>) : <p className="p-8 text-center text-sm text-slate-500">No invoices have been generated yet.</p>}</div></div></section></>;
}

function Placeholder({ page }) { return <div className="grid min-h-[65vh] place-items-center"><div className="max-w-md text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-cyan-50 text-2xl text-cyanbrand-600"><Icon name={page}/></div><h1 className="mt-5 text-3xl font-semibold text-ink">{page}</h1><p className="mt-2 leading-6 text-slate-500">The {page.toLowerCase()} workspace is staged for the next build cycle. The navigation and data model are ready.</p></div></div>; }

export default function FinanceApp({ profile, signOut }) {
  const [page, setPage] = useState('Overview');
  const [rows, setRows] = useState([]);
  const [deals, setDeals] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [invoiceModal, setInvoiceModal] = useState(null);
  const [dataError, setDataError] = useState('');
  useEffect(() => {
    supabase.from('finance_transactions').select('*').order('transaction_date', { ascending: false }).order('created_at', { ascending: false }).then(({ data, error }) => {
      if (error) { setDataError(error.message); return; }
      setRows((data || []).map(item => ({ id: item.id, date: item.transaction_date, description: item.description, party: item.party, category: item.category, type: item.transaction_type, amount: Number(item.amount_npr), status: item.status[0].toUpperCase() + item.status.slice(1) })));
    });
    Promise.all([
      supabase.from('finance_deals').select('*').order('won_at', { ascending: false }),
      supabase.from('finance_invoices').select('*').order('created_at', { ascending: false })
    ]).then(([dealResult, invoiceResult]) => {
      if (dealResult.error || invoiceResult.error) {
        setDataError(dealResult.error?.message || invoiceResult.error?.message);
        return;
      }
      setDeals((dealResult.data || []).map((item) => ({ id: item.id, crmLeadId: item.crm_lead_id, name: item.client_name, company: item.company, email: item.email, phone: item.phone, service: item.service, value: Number(item.deal_value_npr || 0), owner: item.owner_name, status: item.status, wonAt: item.won_at, invoices: [] })));
      setInvoices(invoiceResult.data || []);
    });
  }, []);
  const addRow = async (form) => {
    setDataError('');
    const record = { transaction_date: new Date().toISOString().slice(0,10), description: form.description.trim(), party: form.party.trim() || null, category: form.category.trim(), transaction_type: form.type, amount_npr: Number(form.amount), status: 'cleared', created_by: profile.id };
    const { data, error } = await supabase.from('finance_transactions').insert(record).select().single();
    if (error) { setDataError(error.message); return false; }
    setRows(current => [{ id: data.id, date: data.transaction_date, description: data.description, party: data.party, category: data.category, type: data.transaction_type, amount: Number(data.amount_npr), status: 'Cleared' }, ...current]);
    return true;
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
    const record = {
      id: invoice.id,
      deal_id: invoiceModal.deal.id,
      crm_lead_id: invoiceModal.deal.crmLeadId,
      invoice_number: invoice.invoiceNumber,
      status: invoice.status,
      amount_due_npr: Number(invoice.amountDue || 0),
      grand_total_npr: Number(invoice.grandTotal || 0),
      due_date: invoice.dueDate || null,
      invoice_data: invoice,
      created_by: profile.id
    };
    const { data, error } = await supabase.from('finance_invoices').upsert(record, { onConflict: 'id' }).select().single();
    if (error) {
      setDataError(error.message);
      throw error;
    }
    setInvoices((current) => [data, ...current.filter((item) => item.id !== data.id)]);
    const { error: dealError } = await supabase.from('finance_deals').update({ status: invoice.status === 'paid' ? 'paid' : 'invoicing', updated_at: new Date().toISOString() }).eq('id', invoiceModal.deal.id);
    if (dealError) {
      setDataError(dealError.message);
      throw dealError;
    }
    setDeals((current) => current.map((deal) => deal.id === invoiceModal.deal.id ? { ...deal, status: invoice.status === 'paid' ? 'paid' : 'invoicing' } : deal));
  };
  const initials = (profile?.full_name || profile?.email || 'YB').split(/\s|@/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase();
  const firstName = (profile?.full_name || profile?.email || 'Team').split(/\s|@/)[0];
  const financeUser = { name: profile?.full_name || profile?.email || 'Finance team', email: profile?.email || '' };
  return <div className="min-h-screen bg-[#f4f7f9] lg:flex"><aside className="fixed inset-y-0 hidden w-64 flex-col bg-ink px-4 py-6 text-white lg:flex"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-xl bg-white p-2"><img src="/images/yalabyte-yb-logo.png" alt="YalaByte" className="h-full w-full object-contain"/></span><div><p className="font-bold">YalaByte</p><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyanbrand-400">Finance ERP</p></div></div><p className="mt-8 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Workspace</p><nav className="mt-3 space-y-1">{nav.map(item => <button key={item} onClick={()=>setPage(item)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${page===item?'bg-cyanbrand-500 text-ink':'text-slate-300 hover:bg-white/5 hover:text-white'}`}><Icon name={item}/>{item}</button>)}</nav><div className="mt-auto rounded-xl border border-white/10 p-3"><p className="truncate text-sm font-semibold">{profile?.full_name || profile?.email}</p><p className="mt-1 capitalize text-xs text-cyanbrand-400">{profile?.role}</p><button onClick={signOut} className="mt-3 text-xs font-semibold text-slate-400 hover:text-white">Sign out</button></div></aside><main className="w-full lg:ml-64"><header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-4 lg:px-8"><div className="flex gap-2 overflow-x-auto lg:hidden">{nav.slice(0,4).map(item=><button key={item} onClick={()=>setPage(item)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold ${page===item?'bg-ink text-white':'bg-slate-100 text-slate-600'}`}>{item}</button>)}</div><div className="ml-auto flex items-center gap-3"><span className="hidden text-sm font-medium text-slate-500 sm:block">June 24, 2026</span><span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-xs font-bold text-white">{initials}</span></div></header><div className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">{page==='Overview'?<Overview transactions={rows} invoices={invoices} onNavigate={setPage} name={firstName}/>:page==='Transactions'?<Transactions rows={rows} onAdd={addRow} error={dataError}/>:page==='Invoices'?<Invoices deals={deals} invoices={invoices} onCreate={openInvoiceForDeal} onEdit={editInvoice} error={dataError}/>:<Placeholder page={page}/>}</div>{invoiceModal ? <InvoiceModal currentUser={financeUser} invoice={invoiceModal.invoice} lead={invoiceModal.deal} onClose={() => setInvoiceModal(null)} onSaved={saveInvoice} /> : null}</main></div>;
}
