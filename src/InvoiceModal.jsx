import { useMemo, useState } from 'react';

const inputClass = 'mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition focus:border-cyanbrand-500 focus:ring-4 focus:ring-cyanbrand-100';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function futureDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function invoiceNumber() {
  return `YB-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
}

function amount(value) {
  return Number(value || 0);
}

function money(value) {
  return `NPR ${new Intl.NumberFormat('en-NP', { maximumFractionDigits: 2 }).format(amount(value))}`;
}

function readableDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

async function loadLogo() {
  const response = await fetch('/images/yalabyte-logo-invoice.png');
  if (!response.ok) throw new Error('Logo unavailable');
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function downloadInvoicePdf(invoice) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const navy = [6, 24, 40];
  const cyan = [27, 196, 218];
  const slate = [71, 85, 105];
  const light = [241, 245, 249];

  pdf.setFillColor(...navy);
  pdf.rect(0, 0, 210, 42, 'F');
  try {
    const logo = await loadLogo();
    pdf.addImage(logo, 'PNG', 15, 9.5, 24, 24);
  } catch {
    pdf.setFillColor(...cyan);
    pdf.roundedRect(15, 10, 23, 23, 3, 3, 'F');
    pdf.setTextColor(...navy);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text('YB', 20, 24.5);
  }
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text('YalaByte', 45, 18.5);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(177, 197, 214);
  pdf.text('WEBSITE DESIGN & DEVELOPMENT', 45, 24.5);
  pdf.text('info@yalabyte.com  |  www.yalabyte.com', 45, 30);

  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(24);
  pdf.text('INVOICE', 195, 18, { align: 'right' });
  pdf.setFontSize(9);
  pdf.setTextColor(177, 197, 214);
  pdf.text(invoice.invoiceNumber, 195, 25, { align: 'right' });
  pdf.setTextColor(...cyan);
  pdf.text(invoice.status.toUpperCase(), 195, 31, { align: 'right' });

  pdf.setTextColor(...slate);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.text('BILL TO', 15, 55);
  pdf.setTextColor(...navy);
  pdf.setFontSize(13);
  pdf.text(invoice.clientName || 'Client', 15, 63);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(...slate);
  let clientY = 69;
  [invoice.company, invoice.email, invoice.phone].filter(Boolean).forEach((line) => {
    pdf.text(String(line), 15, clientY);
    clientY += 5;
  });

  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...slate);
  pdf.setFontSize(8);
  pdf.text('ISSUE DATE', 140, 55);
  pdf.text('DUE DATE', 175, 55);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...navy);
  pdf.setFontSize(9);
  pdf.text(readableDate(invoice.issueDate), 140, 62);
  pdf.text(readableDate(invoice.dueDate), 175, 62);

  const tableY = 88;
  pdf.setFillColor(...navy);
  pdf.roundedRect(15, tableY, 180, 10, 2, 2, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.text('DESCRIPTION', 20, tableY + 6.3);
  pdf.text('QTY', 145, tableY + 6.3, { align: 'center' });
  pdf.text('RATE', 169, tableY + 6.3, { align: 'right' });
  pdf.text('AMOUNT', 190, tableY + 6.3, { align: 'right' });

  pdf.setFillColor(248, 250, 252);
  pdf.rect(15, tableY + 12, 180, 29, 'F');
  pdf.setFillColor(...cyan);
  pdf.rect(15, tableY + 12, 1.5, 29, 'F');
  pdf.setTextColor(...navy);
  pdf.setFontSize(10);
  pdf.text(invoice.projectTitle || 'Website development services', 20, tableY + 21);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(...slate);
  const description = pdf.splitTextToSize(invoice.description || 'Professional website design and development services.', 105);
  pdf.text(description.slice(0, 3), 20, tableY + 27);
  pdf.setTextColor(...navy);
  pdf.setFontSize(9);
  pdf.text('1', 145, tableY + 21, { align: 'center' });
  pdf.text(money(invoice.subtotal), 169, tableY + 21, { align: 'right' });
  pdf.text(money(invoice.subtotal), 190, tableY + 21, { align: 'right' });

  const summaryY = tableY + 52;
  const summary = [
    ['Subtotal', money(invoice.subtotal)],
    [`Tax (${invoice.taxRate}%)`, money(invoice.taxAmount)],
    ['Project total', money(invoice.grandTotal)]
  ];
  summary.forEach(([label, value], index) => {
    const y = summaryY + index * 7;
    pdf.setFont('helvetica', index === 2 ? 'bold' : 'normal');
    pdf.setFontSize(index === 2 ? 10 : 9);
    pdf.setTextColor(index === 2 ? navy[0] : slate[0], index === 2 ? navy[1] : slate[1], index === 2 ? navy[2] : slate[2]);
    pdf.text(label, 150, y, { align: 'right' });
    pdf.text(value, 190, y, { align: 'right' });
  });

  const dueY = summaryY + 28;
  pdf.setFillColor(232, 250, 252);
  pdf.roundedRect(15, dueY, 180, 28, 3, 3, 'F');
  pdf.setFillColor(...cyan);
  pdf.roundedRect(15, dueY, 3, 28, 2, 2, 'F');
  pdf.setTextColor(8, 110, 126);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.text(invoice.paymentLabel.toUpperCase(), 24, dueY + 8);
  pdf.setFontSize(16);
  pdf.setTextColor(...navy);
  pdf.text(money(invoice.amountDue), 24, dueY + 19);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(8, 110, 126);
  pdf.text('REMAINING AFTER THIS PAYMENT', 187, dueY + 8, { align: 'right' });
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...navy);
  pdf.setFontSize(12);
  pdf.text(money(invoice.remainingBalance), 187, dueY + 19, { align: 'right' });

  const notesY = dueY + 43;
  pdf.setDrawColor(226, 232, 240);
  pdf.line(15, notesY - 7, 195, notesY - 7);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...navy);
  pdf.setFontSize(9);
  pdf.text('PAYMENT TERMS', 15, notesY);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...slate);
  pdf.setFontSize(8.5);
  const terms = pdf.splitTextToSize(invoice.paymentInstructions || 'Payment details will be shared separately.', 82);
  pdf.text(terms.slice(0, 5), 15, notesY + 7);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...navy);
  pdf.text('NOTES', 110, notesY);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...slate);
  const notes = pdf.splitTextToSize(invoice.notes || 'Thank you for choosing YalaByte.', 80);
  pdf.text(notes.slice(0, 5), 110, notesY + 7);

  pdf.setFillColor(...light);
  pdf.rect(0, 276, 210, 21, 'F');
  pdf.setTextColor(...slate);
  pdf.setFontSize(8);
  pdf.text('Thank you for building with YalaByte.', 15, 286);
  pdf.text('Questions? info@yalabyte.com', 195, 286, { align: 'right' });
  pdf.setTextColor(...cyan);
  pdf.text('Crafted for clarity. Built for growth.', 15, 291);

  pdf.save(`${invoice.invoiceNumber}-${(invoice.company || invoice.clientName || 'client').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`);
}

export default function InvoiceModal({ lead, invoice: existingInvoice, currentUser, onClose, onSaved }) {
  const previousDeposit = (lead.invoices || []).find((invoice) => invoice.paymentMode === 'deposit' && invoice.status !== 'cancelled');
  const hasDeposit = Boolean(previousDeposit);
  const [form, setForm] = useState(existingInvoice || {
    id: `invoice-${Date.now()}`,
    invoiceNumber: invoiceNumber(),
    clientName: lead.name || '',
    company: lead.company || '',
    email: lead.email || '',
    phone: lead.phone || '',
    projectTitle: lead.service || 'Website Development',
    description: `Professional ${lead.service || 'website design and development'} services${lead.company ? ` for ${lead.company}` : ''}.`,
    issueDate: today(),
    dueDate: futureDate(7),
    subtotal: previousDeposit?.subtotal || lead.value || '',
    taxRate: previousDeposit?.taxRate || 0,
    paymentMode: hasDeposit ? 'final' : 'deposit',
    depositPercent: 40,
    previouslyPaid: previousDeposit?.amountDue || 0,
    customAmount: '',
    status: 'issued',
    paymentInstructions: 'Please complete payment by the due date. Payment details can be confirmed with your YalaByte project contact.',
    notes: 'Thank you for trusting YalaByte with your digital project.'
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const totals = useMemo(() => {
    const subtotal = amount(form.subtotal);
    const taxAmount = subtotal * amount(form.taxRate) / 100;
    const grandTotal = subtotal + taxAmount;
    const previouslyPaid = Math.min(amount(form.previouslyPaid), grandTotal);
    let amountDue = grandTotal;
    let paymentLabel = 'Full payment due';
    if (form.paymentMode === 'deposit') {
      amountDue = grandTotal * amount(form.depositPercent) / 100;
      paymentLabel = `${amount(form.depositPercent)}% deposit due`;
    } else if (form.paymentMode === 'final') {
      amountDue = Math.max(grandTotal - previouslyPaid, 0);
      paymentLabel = 'Final balance due';
    } else if (form.paymentMode === 'custom') {
      amountDue = Math.min(amount(form.customAmount), Math.max(grandTotal - previouslyPaid, 0));
      paymentLabel = 'Payment due now';
    }
    const remainingBalance = Math.max(grandTotal - previouslyPaid - amountDue, 0);
    return { subtotal, taxAmount, grandTotal, previouslyPaid, amountDue, remainingBalance, paymentLabel };
  }, [form.subtotal, form.taxRate, form.paymentMode, form.depositPercent, form.previouslyPaid, form.customAmount]);

  const change = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const generate = async () => {
    if (!form.clientName.trim() || !form.projectTitle.trim() || totals.subtotal <= 0 || totals.amountDue <= 0) {
      setError('Add the client, project, total value, and a valid payment amount.');
      return;
    }
    setBusy(true);
    setError('');
    const invoice = {
      ...form,
      ...totals,
      updatedAt: new Date().toISOString(),
      createdAt: existingInvoice?.createdAt || new Date().toISOString(),
      createdBy: existingInvoice?.createdBy || currentUser.name,
      createdByEmail: existingInvoice?.createdByEmail || currentUser.email
    };
    try {
      await downloadInvoicePdf(invoice);
      await onSaved(invoice, Boolean(existingInvoice));
      onClose();
    } catch (generationError) {
      setError(generationError.message || 'Unable to generate the PDF.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5" role="dialog" aria-modal="true" aria-label="Invoice generator">
      <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6">
          <div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-cyan-700">YalaByte billing</p><h2 className="mt-1 text-xl font-extrabold">{existingInvoice ? 'Invoice details' : 'Create invoice'}</h2></div>
          <button className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200" onClick={onClose} type="button">Close</button>
        </div>

        <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-5">
            <section><h3 className="text-sm font-extrabold text-slate-900">Client & invoice</h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600">Client name<input className={inputClass} name="clientName" value={form.clientName} onChange={change} /></label><label className="text-xs font-bold text-slate-600">Company<input className={inputClass} name="company" value={form.company} onChange={change} /></label><label className="text-xs font-bold text-slate-600">Email<input className={inputClass} name="email" type="email" value={form.email} onChange={change} /></label><label className="text-xs font-bold text-slate-600">Phone<input className={inputClass} name="phone" value={form.phone} onChange={change} /></label><label className="text-xs font-bold text-slate-600">Invoice number<input className={inputClass} name="invoiceNumber" value={form.invoiceNumber} onChange={change} /></label><label className="text-xs font-bold text-slate-600">Status<select className={inputClass} name="status" value={form.status} onChange={change}><option value="issued">Issued</option><option value="paid">Paid</option><option value="draft">Draft</option><option value="cancelled">Cancelled</option></select></label><label className="text-xs font-bold text-slate-600">Issue date<input className={inputClass} name="issueDate" type="date" value={form.issueDate} onChange={change} /></label><label className="text-xs font-bold text-slate-600">Due date<input className={inputClass} name="dueDate" type="date" value={form.dueDate} onChange={change} /></label></div></section>

            <section className="border-t border-slate-200 pt-5"><h3 className="text-sm font-extrabold text-slate-900">Project</h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600 sm:col-span-2">Project / service<input className={inputClass} name="projectTitle" value={form.projectTitle} onChange={change} /></label><label className="text-xs font-bold text-slate-600 sm:col-span-2">Description<textarea className={`${inputClass} min-h-20`} name="description" value={form.description} onChange={change} /></label><label className="text-xs font-bold text-slate-600">Project value (NPR)<input className={inputClass} min="0" name="subtotal" type="number" value={form.subtotal} onChange={change} /></label><label className="text-xs font-bold text-slate-600">Tax rate (%)<input className={inputClass} min="0" name="taxRate" step="0.01" type="number" value={form.taxRate} onChange={change} /></label></div></section>

            <section className="border-t border-slate-200 pt-5"><h3 className="text-sm font-extrabold text-slate-900">Payment schedule</h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600">Invoice type<select className={inputClass} name="paymentMode" value={form.paymentMode} onChange={change}><option value="deposit">Deposit / advance</option><option value="final">Final balance</option><option value="full">Full payment</option><option value="custom">Custom installment</option></select></label>{form.paymentMode === 'deposit' ? <label className="text-xs font-bold text-slate-600">Deposit percentage<input className={inputClass} max="100" min="1" name="depositPercent" type="number" value={form.depositPercent} onChange={change} /></label> : null}{['final', 'custom'].includes(form.paymentMode) ? <label className="text-xs font-bold text-slate-600">Amount already paid<input className={inputClass} min="0" name="previouslyPaid" type="number" value={form.previouslyPaid} onChange={change} /></label> : null}{form.paymentMode === 'custom' ? <label className="text-xs font-bold text-slate-600">Amount due now<input className={inputClass} min="0" name="customAmount" type="number" value={form.customAmount} onChange={change} /></label> : null}</div></section>

            <section className="border-t border-slate-200 pt-5"><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600">Payment terms<textarea className={`${inputClass} min-h-24`} name="paymentInstructions" value={form.paymentInstructions} onChange={change} /></label><label className="text-xs font-bold text-slate-600">Notes<textarea className={`${inputClass} min-h-24`} name="notes" value={form.notes} onChange={change} /></label></div></section>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              <div className="bg-ink p-5 text-white"><div className="flex items-center gap-3"><img className="h-12 w-12 object-contain" src="/images/yalabyte-logo-invoice.png" alt="" /><div><p className="text-lg font-extrabold">YalaByte</p><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-cyanbrand-400">Invoice preview</p></div></div></div>
              <div className="space-y-3 p-5 text-sm"><div className="flex justify-between gap-3"><span className="text-slate-500">Project total</span><strong>{money(totals.grandTotal)}</strong></div><div className="flex justify-between gap-3"><span className="text-slate-500">Tax</span><strong>{money(totals.taxAmount)}</strong></div>{totals.previouslyPaid > 0 ? <div className="flex justify-between gap-3"><span className="text-slate-500">Already paid</span><strong className="text-emerald-700">− {money(totals.previouslyPaid)}</strong></div> : null}<div className="border-t border-slate-200 pt-3"><p className="text-xs font-extrabold uppercase tracking-[0.12em] text-cyan-700">{totals.paymentLabel}</p><p className="mt-1 text-2xl font-extrabold text-slate-950">{money(totals.amountDue)}</p></div><div className="flex justify-between gap-3 rounded-lg bg-white px-3 py-2"><span className="text-slate-500">Remaining after payment</span><strong>{money(totals.remainingBalance)}</strong></div></div>
            </div>
            {error ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p> : null}
            <button className="mt-4 w-full rounded-xl bg-cyanbrand-500 px-4 py-3.5 text-sm font-extrabold text-ink shadow-sm hover:bg-cyanbrand-400 disabled:opacity-50" disabled={busy} onClick={generate} type="button">{busy ? 'Generating PDF…' : existingInvoice ? 'Update & download PDF' : 'Save & download PDF'}</button>
            <p className="mt-2 text-center text-[11px] leading-5 text-slate-400">The invoice is saved in Finance and downloaded as a branded PDF.</p>
          </aside>
        </div>
      </div>
    </div>
  );
}
