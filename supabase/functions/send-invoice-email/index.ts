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

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userResult.user.id)
      .maybeSingle();

    const { data: teamMember } = await supabase
      .from('team_members')
      .select('role')
      .eq('user_id', userResult.user.id)
      .maybeSingle();

    const { data: queuedEmail, error: emailError } = await supabase
      .from('finance_invoice_emails')
      .select('*, finance_invoices(invoice_number, amount_due_npr, due_date, invoice_data)')
      .eq('id', emailId)
      .maybeSingle();
    if (emailError) throw new Error(`Queued email lookup failed: ${emailError.message}`);
    if (!queuedEmail) throw new Error(`Queued email was not found for id ${emailId}.`);
    if (queuedEmail.status !== 'queued') throw new Error(`Queued email is already ${queuedEmail.status}.`);

    const hasFinanceRole = ['admin', 'finance'].includes(profile?.role) || ['admin', 'finance'].includes(teamMember?.role);
    const createdByRequester = queuedEmail.created_by === userResult.user.id;
    if (!hasFinanceRole && !createdByRequester) throw new Error('Finance access is required to send invoices.');

    const bodyHtml = `<p>${queuedEmail.body.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
    const signatureText = '\n\nRegards,\nYalaByte Finance\ninfo@yalabyte.com | www.yalabyte.com';
    const html = `
      ${bodyHtml}
      <div style="margin-top:24px;padding-top:18px;border-top:1px solid #e2e8f0;font-family:Arial,sans-serif;">
        <p style="margin:0 0 10px;color:#0f172a;font-size:14px;line-height:20px;">Regards,<br><strong>YalaByte Finance</strong></p>
        <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
          <tr>
            <td style="width:42px;height:42px;border-radius:12px;background:#061828;text-align:center;vertical-align:middle;">
              <span style="display:inline-block;color:#13c8de;font-size:18px;font-weight:800;letter-spacing:-1px;">YB</span>
            </td>
            <td style="padding-left:12px;vertical-align:middle;">
              <div style="color:#061828;font-size:18px;font-weight:800;line-height:20px;">YalaByte</div>
              <div style="color:#0891a6;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Finance</div>
            </td>
          </tr>
        </table>
        <p style="margin:10px 0 0;color:#64748b;font-size:12px;line-height:18px;">info@yalabyte.com | www.yalabyte.com</p>
      </div>
    `;
    const attachments = queuedEmail.attachment_base64
      ? [{
          filename: queuedEmail.attachment_filename || `${queuedEmail.finance_invoices?.invoice_number || 'YalaByte-invoice'}.pdf`,
          content: queuedEmail.attachment_base64,
          encoding: 'base64',
          contentType: 'application/pdf',
        }]
      : [];

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
      text: `${queuedEmail.body}${signatureText}`,
      html,
      attachments,
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
    console.error('send-invoice-email failed:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
