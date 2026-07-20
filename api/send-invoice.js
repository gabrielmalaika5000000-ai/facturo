import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { invoice_id, user_id } = req.body;
        if (!invoice_id || !user_id) return res.status(400).json({ error: 'Paramètres manquants' });

        const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const resend = new Resend(process.env.RESEND_API_KEY);

        const { data: invoice, error: invError } = await sb
            .from('invoices')
            .select('*, clients(*), profiles(*)')
            .eq('id', invoice_id)
            .eq('user_id', user_id)
            .single();

        if (invError || !invoice) return res.status(404).json({ error: 'Facture introuvable' });
        if (!invoice.clients?.email) return res.status(400).json({ error: 'Le client n\'a pas d\'email' });

        const paymentLink = `https://facturo-ten.vercel.app/?invoice=${invoice.id}&amount=${invoice.total}`;
        const fromName = invoice.profiles?.company_name || 'Facturo';
        const fromEmail = process.env.RESEND_FROM_EMAIL;

        const html = `<!DOCTYPE html><html><head><style>
            body{font-family:Arial,sans-serif;background:#f8fafc;color:#102a43;margin:0;padding:0}
            .container{max-width:600px;margin:0 auto;padding:20px}
            .header{background:#102a43;color:white;padding:30px;text-align:center;border-radius:8px 8px 0 0}
            .content{background:white;padding:40px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px}
            .invoice-box{background:#f1f5f9;padding:20px;border-radius:8px;margin:25px 0;text-align:center}
            .btn{display:inline-block;background:#102a43;color:white!important;padding:15px 30px;text-decoration:none;border-radius:8px;font-weight:bold;margin-top:20px}
            .footer{text-align:center;margin-top:30px;font-size:12px;color:#64748b}
        </style></head><body>
        <div class="container">
            <div class="header"><h1 style="margin:0">Nouvelle Facture</h1><p style="margin:5px 0 0;opacity:.8">De ${fromName}</p></div>
            <div class="content">
                <p>Bonjour ${invoice.clients.name},</p>
                <p>Vous avez reçu une facture de <strong>${fromName}</strong>. Réglez-la directement en ligne via Mobile Money ou Carte Bancaire.</p>
                <div class="invoice-box">
                    <p style="margin:0 0 5px;font-size:13px;color:#64748b">FACTURE N°</p>
                    <p style="margin:0 0 15px;font-size:20px;font-weight:bold">${invoice.number}</p>
                    <p style="margin:0 0 5px;font-size:13px;color:#64748b">MONTANT À PAYER</p>
                    <p style="margin:0;font-size:28px;font-weight:bold;color:#102a43">${parseFloat(invoice.total).toFixed(2)} FCFA</p>
                </div>
                <div style="text-align:center"><a href="${paymentLink}" class="btn">Payer maintenant</a></div>
                <p style="margin-top:25px;font-size:13px;color:#64748b">Lien direct : <a href="${paymentLink}" style="color:#102a43">${paymentLink}</a></p>
            </div>
            <div class="footer"><p>Envoyé via Facturo · ${new Date().getFullYear()}</p></div>
        </div></body></html>`;

        const { error: emailError } = await resend.emails.send({
            from: `${fromName} <${fromEmail}>`,
            to: invoice.clients.email,
            reply_to: invoice.profiles?.email || fromEmail,
            subject: `Facture ${invoice.number} - ${parseFloat(invoice.total).toFixed(2)} FCFA`,
            html
        });

        if (emailError) {
            console.error('Erreur Resend:', emailError);
            return res.status(500).json({ error: 'Erreur envoi email' });
        }

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('Erreur:', error.message);
        return res.status(500).json({ error: error.message });
    }
}
