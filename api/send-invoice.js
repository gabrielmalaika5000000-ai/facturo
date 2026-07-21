const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

export default async (req, res) => {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { invoice_id, user_id } = req.body;

        if (!invoice_id || !user_id) {
            return res.status(400).json({ error: 'Paramètres manquants' });
        }

        const { data: invoice, error: invError } = await supabase
            .from('invoices')
            .select('*, clients(*), profiles(*)')
            .eq('id', invoice_id)
            .eq('user_id', user_id)
            .single();

        if (invError || !invoice) return res.status(404).json({ error: 'Facture introuvable' });
        if (!invoice.clients || !invoice.clients.email) return res.status(400).json({ error: 'Le client n\'a pas d\'adresse email' });

        const fromName = invoice.profiles.company_name || 'Facturo';
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@facturo.com';
        const currencySymbol = invoice.profiles.currency_symbol || 'FCFA';
        
        // Préparation des moyens de paiement
        const wave = invoice.profiles.wave_number;
        const orange = invoice.profiles.orange_number;
        const iban = invoice.profiles.iban;
        
        let paymentMethodsHtml = `
            <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin-top: 20px; text-align: left;">
                <p style="margin: 0 0 15px 0; font-weight: bold; color: #102a43; font-size: 16px;">Moyens de paiement acceptés :</p>
                <div style="display: grid; gap: 10px;">
        `;
        
        let hasPaymentMethod = false;
        if (wave) {
            hasPaymentMethod = true;
            paymentMethodsHtml += `<p style="margin: 0; font-size: 14px;"><strong>📱 Payer par Wave :</strong> ${wave}</p>`;
        }
        if (orange) {
            hasPaymentMethod = true;
            paymentMethodsHtml += `<p style="margin: 0; font-size: 14px;"><strong>🟠 Payer par Orange Money :</strong> ${orange}</p>`;
        }
        if (iban) {
            hasPaymentMethod = true;
            paymentMethodsHtml += `<p style="margin: 0; font-size: 14px;"><strong>🏦 Virement IBAN :</strong> ${iban}</p>`;
        }
        
        if (!hasPaymentMethod) {
            paymentMethodsHtml += `<p style="margin: 0; font-size: 14px; font-style: italic; color: #64748b;">Contactez votre prestataire pour les modalités de règlement.</p>`;
        }
        
        paymentMethodsHtml += `
                </div>
            </div>
        `;
        
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Plus Jakarta Sans', Arial, sans-serif; background-color: #f8fafc; color: #102a43; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #102a43; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background-color: white; padding: 40px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
                .invoice-details { background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin: 25px 0; text-align: center; }
                .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #64748b; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1 style="margin: 0; font-size: 24px;">Nouvelle Facture</h1>
                    <p style="margin: 5px 0 0 0; opacity: 0.8;">De ${fromName}</p>
                </div>
                <div class="content">
                    <p>Bonjour ${invoice.clients.name},</p>
                    <p>Vous avez reçu une nouvelle facture de la part de ${fromName}. Veuillez trouver les détails ci-dessous et procéder au règlement via les moyens indiqués.</p>
                    
                    <div class="invoice-details">
                        <p style="margin: 0 0 10px 0; font-size: 14px; color: #64748b;">FACTURE N°</p>
                        <p style="margin: 0 0 15px 0; font-size: 20px; font-weight: bold;">${invoice.number}</p>
                        <p style="margin: 0 0 5px 0; font-size: 14px; color: #64748b;">MONTANT À PAYER</p>
                        <p style="margin: 0; font-size: 28px; font-weight: bold; color: #102a43;">${invoice.total.toFixed(2)} ${currencySymbol}</p>
                    </div>

                    ${paymentMethodsHtml}
                </div>
                <div class="footer">
                    <p>&copy; ${new Date().getFullYear()} ${fromName}. Tous droits réservés.<br>Email envoyé via Facturo.</p>
                </div>
            </div>
        </body>
        </html>
        `;

        const { error: emailError } = await resend.emails.send({
            from: `${fromName} <${fromEmail}>`,
            to: invoice.clients.email,
            reply_to: invoice.profiles.email || fromEmail,
            subject: `Facture ${invoice.number} - ${invoice.total.toFixed(2)} ${currencySymbol}`,
            html: html,
        });

        if (emailError) {
            console.error('Erreur Resend:', emailError);
            return res.status(500).json({ error: 'Erreur lors de l\'envoi de l\'email' });
        }

        return res.status(200).json({ success: true, message: 'Email envoyé' });

    } catch (error) {
        console.error('Erreur serveur:', error);
        return res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
