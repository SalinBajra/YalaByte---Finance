import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import nodemailer from 'npm:nodemailer@6.9.16';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const money = (value: number) =>
  `Rs ${new Intl.NumberFormat('en-NP', { maximumFractionDigits: 0 }).format(value || 0)}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) throw new Error('Missing authorization token.');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const smtpUser = Deno.env.get('ZOHO_SMTP_USER') || 'info@yalabyte.com';
    const smtpPass = Deno.env.get('ZOHO_SMTP_PASSWORD') || '';
    if (!supabaseUrl || !serviceRoleKey || !smtpPass) throw new Error('Email function is missing required environment variables.');

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { emailId } = await req.json();
    if (!emailId) throw new Error('Missing emailId.');

    const { data: userResult, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userResult?.user) throw new Error('Invalid Finance session.');

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userResult.user.id)
      .single();
    if (profileError || !['admin', 'finance'].includes(profile?.role)) throw new Error('Finance access is required to send invoices.');

    const { data: queuedEmail, error: emailError } = await supabase
      .from('finance_invoice_emails')
      .select('*, finance_invoices(invoice_number, amount_due_npr, due_date, invoice_data)')
      .eq('id', emailId)
      .eq('status', 'queued')
      .single();
    if (emailError || !queuedEmail) throw new Error('Queued email was not found.');

    const invoice = queuedEmail.finance_invoices;
    const clientName = invoice?.invoice_data?.clientName || invoice?.invoice_data?.company || 'Client';
    const html = `
      <p>Hello ${clientName},</p>
      <p>Please find your YalaByte invoice details below.</p>
      <p><strong>Invoice:</strong> ${invoice?.invoice_number || queuedEmail.subject}<br>
      <strong>Amount due:</strong> ${money(Number(invoice?.amount_due_npr || 0))}<br>
      <strong>Due date:</strong> ${invoice?.due_date || 'Not set'}</p>
      <p>${queuedEmail.body.replace(/\n/g, '<br>')}</p>
      <p>Regards,<br>YalaByte Finance</p>
    `;

    const transporter = nodemailer.createTransport({
      host: Deno.env.get('ZOHO_SMTP_HOST') || 'smtp.zoho.com',
      port: Number(Deno.env.get('ZOHO_SMTP_PORT') || 465),
      secure: true,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: `"YalaByte Finance" <${smtpUser}>`,
      to: queuedEmail.to_email,
      cc: queuedEmail.cc_email || undefined,
      subject: queuedEmail.subject,
      text: queuedEmail.body,
      html,
    });

    await supabase
      .from('finance_invoice_emails')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', emailId);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
