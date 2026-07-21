import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
    console.log('[WELCOME EMAIL] Webhook reçu de Supabase.');

    // Supabase envoie les webhooks en POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const payload = req.body;
        console.log('[WELCOME EMAIL] Payload brut:', JSON.stringify(payload));

        // Extraire l'email selon la structure standard des webhooks Supabase
        // Supabase envoie généralement { type: "INSERT", table: "users", record: { id, email } }
        const userEmail = payload?.record?.email;
        const userId = payload?.record?.id;

        if (!userEmail) {
            console.error('[WELCOME EMAIL] Aucun email trouvé dans le payload.');
            return res.status(400).json({ error: 'Email manquant' });
        }

        console.log(`[WELCOME EMAIL] Envoi de l'email de bienvenue à ${userEmail}`);

        const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@facturo.com';
        const appUrl = 'https://facturo-ten.vercel.app';

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Plus Jakarta Sans', Arial, sans-serif; background-color: #f8fafc; color: #102a43; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #102a43; color: white; padding: 40px 30px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background-color: white; padding: 40px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
                .btn { display: inline-block; background-color: #facc15; color: #102a43 !important; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 20px; font-size: 16px; }
                .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #64748b; }
                ul { padding-left: 20px; line-height: 1.6; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1 style="margin: 0; font-size: 28px;">Bienvenue sur Facturo ! 🎉</h1>
                    <p style="margin: 10px 0 0 0; opacity: 0.8;">Votre copilote de facturation</p>
                </div>
                <div class="content">
                    <p>Bonjour,</p>
                    <p>Nous sommes ravis de vous compter parmi nous ! Vous venez de rejoindre la plateforme de facturation la plus simple et adaptée aux freelances d'Afrique francophone.</p>
                    
                    <p><strong>Voici ce que vous pouvez faire dès maintenant :</strong></p>
                    <ul>
                        <li>📄 Créer des factures professionnelles en 30 secondes</li>
                        <li>📱 Ajouter vos liens de paiement Mobile Money (Wave, Orange) directement sur le PDF</li>
                        <li>📊 Suivre vos revenus et vos impayés sur votre tableau de bord</li>
                        <li>✉️ Envoyer vos factures par email à vos clients en 1 clic</li>
                    </ul>

                    <p>Pour commencer, nous vous invitons à compléter vos informations professionnelles dans les paramètres.</p>
                    
                    <div style="text-align: center;">
                        <a href="${appUrl}" class="btn">Accéder à mon espace</a>
                    </div>
                </div>
                <div class="footer">
                    <p>&copy; ${new Date().getFullYear()} Facturo. Tous droits réservés.<br>Si vous n'êtes pas à l'origine de cette inscription, vous pouvez ignorer cet email.</p>
                </div>
            </div>
        </body>
        </html>
        `;

        const { error: emailError } = await resend.emails.send({
            from: `Facturo <${fromEmail}>`,
            to: userEmail,
            subject: "Bienvenue sur Facturo ! 🎉",
            html: html,
        });

        if (emailError) {
            console.error('[WELCOME EMAIL] Erreur Resend:', emailError);
            return res.status(500).json({ error: 'Erreur lors de l\'envoi de l\'email' });
        }

        console.log('[WELCOME EMAIL] Email envoyé avec succès.');
        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('[WELCOME EMAIL] Erreur globale:', error);
        return res.status(500).json({ error: 'Erreur interne du serveur' });
    }
}
