require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

exports.handler = async (event) => {
    console.log("Démarrage de la tâche de relances automatiques...");
    const now = new Date();

    const { data: invoices, error } = await supabase
        .from('invoices')
        .select('id, number, total, due_date, issue_date, client_id, user_id, clients(name, email), profiles(email, company_name, plan)')
        .eq('status', 'pending')
        .lt('due_date', now.toISOString());

    if (error) {
        console.error("Erreur récupération factures:", error);
        return { statusCode: 500 };
    }

    let relancesEnvoyees = 0;

    for (const inv of invoices) {
        if (inv.profiles.plan !== 'pro') continue;
        if (!inv.clients.email) continue;

        const dueDate = new Date(inv.due_date);
        const diffDays = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));

        let level = null;
        if (diffDays > 0 && diffDays < 15) level = 'douce';
        else if (diffDays >= 15 && diffDays <= 30) level = 'ferme';
        else if (diffDays > 30) level = 'demeuree';
        if (!level) continue;

        const { data: existingLog } = await supabase
            .from('relance_logs')
            .select('id')
            .eq('invoice_id', inv.id)
            .eq('level', level)
            .maybeSingle();

        if (existingLog) continue;

        const subject = level === 'douce'
            ? `Rappel : Facture ${inv.number} en attente`
            : level === 'ferme'
            ? `Relance : Facture ${inv.number} en retard`
            : `Mise en demeure : Facture ${inv.number}`;

        const color = level === 'douce' ? '#102a43' : level === 'ferme' ? '#d97706' : '#dc2626';
        const intro = level === 'douce'
            ? `Nous vous contactons concernant la facture arrivée à échéance il y a ${diffDays} jours.`
            : level === 'ferme'
            ? `Malgré notre rappel, la facture reste impayée (${diffDays} jours de retard).`
            : `À défaut de paiement sous 8 jours, nous procéderons à des recours légaux.`;

        const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
            <div style="background:${color};color:white;padding:20px;border-radius:8px 8px 0 0">
                <h2 style="margin:0">${level === 'demeuree' ? 'Mise en demeure' : 'Relance de paiement'}</h2>
            </div>
            <div style="background:#f9fafb;padding:30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
                <p>Bonjour ${inv.clients.name},</p>
                <p>${intro}</p>
                <div style="background:white;padding:15px;margin:20px 0;border-left:4px solid ${color}">
                    <p><strong>Référence :</strong> ${inv.number}</p>
                    <p><strong>Échéance :</strong> ${new Date(inv.due_date).toLocaleDateString('fr-FR')}</p>
                    <p><strong>Montant :</strong> <span style="color:${color};font-size:1.2em">${inv.total.toFixed(2)} €</span></p>
                </div>
                <p>Cordialement,<br><strong>${inv.profiles.company_name || 'Votre prestataire'}</strong></p>
            </div>
        </body></html>`;

        try {
            await resend.emails.send({
                from: process.env.RESEND_FROM_EMAIL,
                to: inv.clients.email,
                reply_to: inv.profiles.email,
                subject,
                html
            });

            await supabase.from('relance_logs').insert([{ invoice_id: inv.id, level }]);
            relancesEnvoyees++;
        } catch (err) {
            console.error(`Erreur email ${inv.number}:`, err);
        }
    }

    console.log(`Terminé. ${relancesEnvoyees} relances envoyées.`);
    return { statusCode: 200, body: JSON.stringify({ sent: relancesEnvoyees }) };
};
