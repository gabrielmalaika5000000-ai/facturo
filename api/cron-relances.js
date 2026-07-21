import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// Initialisation des clients avec les variables d'environnement
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
    console.log('[CRON RELANCES] Démarrage du cron job de relances automatiques...');

    // Sécurité optionnelle : Vercel Cron envoie un header d'autorisation
    // if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    //     return res.status(401).json({ error: 'Unauthorized' });
    // }

    try {
        const today = new Date();
        
        // 1. Récupérer toutes les factures impayées dont la date d'échéance est dépassée
        const { data: invoices, error: invError } = await supabase
            .from('invoices')
            .select(`
                id, number, total, due_date, issue_date,
                clients ( name, email ),
                profiles ( company_name, wave_number, orange_number, iban, currency_symbol, email )
            `)
            .eq('status', 'pending')
            .lt('due_date', today.toISOString());

        if (invError) {
            console.error('[CRON RELANCES] Erreur récupération factures:', invError);
            throw invError;
        }

        console.log(`[CRON RELANCES] ${invoices.length} factures en retard trouvées.`);

        let relancesEnvoyees = 0;

        for (const inv of invoices) {
            console.log(`[CRON RELANCES] Traitement facture ${inv.number}...`);
            
            if (!inv.clients || !inv.clients.email) {
                console.log(`[CRON RELANCES] Pas d'email client pour ${inv.number}, ignore.`);
                continue;
            }

            // 2. Calculer les jours de retard
            const dueDate = new Date(inv.due_date);
            const diffDays = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));

            // 3. Déterminer le niveau de relance
            let level = null;
            if (diffDays > 0 && diffDays < 7) level = 'douce';
            else if (diffDays >= 7 && diffDays <= 30) level = 'ferme';
            else if (diffDays > 30) level = 'demeuree';

            if (!level) continue;

            // 4. Vérifier si une relance de CE NIVEAU a déjà été envoyée pour cette facture
            const { data: existingLog } = await supabase
                .from('relance_logs')
                .select('id')
                .eq('invoice_id', inv.id)
                .eq('level', level)
                .maybeSingle();

            if (existingLog) {
                console.log(`[CRON RELANCES] Relance ${level} déjà envoyée pour ${inv.number}, ignore.`);
                continue;
            }

            // 5. Préparer les variables pour l'email
            const currency = inv.profiles?.currency_symbol || 'FCFA';
            const amount = `${inv.total.toFixed(2)} ${currency}`;
            const companyName = inv.profiles?.company_name || 'Votre prestataire';
            const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@facturo.com';

            // Préparer les moyens de paiement HTML
            let paymentMethodsHtml = `
                <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin-top: 20px; text-align: left;">
                    <p style="margin: 0 0 15px 0; font-weight: bold; color: #102a43; font-size: 16px;">Moyens de paiement acceptés :</p>
                    <div style="display: grid; gap: 10px;">
            `;
            
            let hasPaymentMethod = false;
            if (inv.profiles?.wave_number) {
                hasPaymentMethod = true;
                paymentMethodsHtml += `<p style="margin: 0; font-size: 14px;"><strong>📱 Payer par Wave :</strong> ${inv.profiles.wave_number}</p>`;
            }
            if (inv.profiles?.orange_number) {
                hasPaymentMethod = true;
                paymentMethodsHtml += `<p style="margin: 0; font-size: 14px;"><strong>🟠 Payer par Orange Money :</strong> ${inv.profiles.orange_number}</p>`;
            }
            if (inv.profiles?.iban) {
                hasPaymentMethod = true;
                paymentMethodsHtml += `<p style="margin: 0; font-size: 14px;"><strong>🏦 Virement IBAN :</strong> ${inv.profiles.iban}</p>`;
            }
            
            if (!hasPaymentMethod) {
                paymentMethodsHtml += `<p style="margin: 0; font-size: 14px; font-style: italic; color: #64748b;">Contactez votre prestataire pour les modalités de règlement.</p>`;
            }
            paymentMethodsHtml += `</div></div>`;

            // Sujets et intros selon le niveau
            let subject, introText, titleText;
            if (level === 'douce') {
                subject = `Rappel : Facture ${inv.number} en attente de paiement`;
                titleText = "Rappel de paiement";
                introText = `Nous espérons que vous allez bien. Nous vous contactons concernant la facture ci-dessous qui est arrivée à échéance il y a ${diffDays} jour(s).`;
            } else if (level === 'ferme') {
                subject = `Relance : Facture ${inv.number} en retard de paiement`;
                titleText = "Relance de paiement";
                introText = `Malgré notre précédent rappel, la facture suivante reste impayée à ce jour (retard de ${diffDays} jours).`;
            } else {
                subject = `Mise en demeure : Facture ${inv.number} impayée`;
                titleText = "Mise en demeure";
                introText = `À défaut de règlement de la facture ci-dessous (retard de plus de 30 jours), nous serons contraints de procéder à des recours légaux pour recouvrer la somme due.`;
            }

            // Template HTML
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
                        <h1 style="margin: 0; font-size: 24px;">${titleText}</h1>
                        <p style="margin: 5px 0 0 0; opacity: 0.8;">De ${companyName}</p>
                    </div>
                    <div class="content">
                        <p>Bonjour ${inv.clients.name},</p>
                        <p>${introText}</p>
                        
                        <div class="invoice-details">
                            <p style="margin: 0 0 10px 0; font-size: 14px; color: #64748b;">FACTURE N°</p>
                            <p style="margin: 0 0 15px 0; font-size: 20px; font-weight: bold;">${inv.number}</p>
                            <p style="margin: 0 0 5px 0; font-size: 14px; color: #64748b;">MONTANT À PAYER</p>
                            <p style="margin: 0; font-size: 28px; font-weight: bold; color: #102a43;">${amount}</p>
                        </div>

                        <p>Nous vous prions de bien vouloir procéder au règlement dans les plus brefs délais.</p>
                        
                        ${paymentMethodsHtml}
                    </div>
                    <div class="footer">
                        <p>&copy; ${new Date().getFullYear()} ${companyName}. Tous droits réservés.<br>Email envoyé via Facturo.</p>
                    </div>
                </div>
            </body>
            </html>
            `;

            // 6. Envoi via Resend
            const { error: emailError } = await resend.emails.send({
                from: `${companyName} <${fromEmail}>`,
                to: inv.clients.email,
                reply_to: inv.profiles?.email || fromEmail,
                subject: subject,
                html: html,
            });

            if (emailError) {
                console.error(`[CRON RELANCES] Erreur envoi email pour ${inv.number}:`, emailError);
                continue; // Passer à la suivante sans logger en base
            }

            // 7. Logger la relance dans Supabase
            const { error: logError } = await supabase
                .from('relance_logs')
                .insert([{ invoice_id: inv.id, level: level, sent_at: new Date().toISOString() }]);

            if (logError) {
                console.error(`[CRON RELANCES] Erreur log relance pour ${inv.number}:`, logError);
            } else {
                console.log(`[CRON RELANCES] Relance ${level} envoyée pour ${inv.number} à ${inv.clients.email}`);
                relancesEnvoyees++;
            }
        }

        console.log(`[CRON RELANCES] Terminé. ${relancesEnvoyees} relances envoyées.`);
        return res.status(200).json({ success: true, relancesEnvoyees });

    } catch (error) {
        console.error('[CRON RELANCES] Erreur globale:', error);
        return res.status(500).json({ error: 'Erreur interne du serveur' });
    }
}
