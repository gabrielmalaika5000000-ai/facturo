import { createClient } from '@supabase/supabase-js';

const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const payload = req.body;
        console.log('Webhook Chariow:', JSON.stringify(payload));

        if (payload.event === 'sale.completed' || payload.event === 'sale.paid') {
            const userId = payload.data?.sale?.custom_metadata?.user_id;
            if (userId) {
                const { error } = await sb.from('profiles')
                    .update({ plan: 'pro' })
                    .eq('id', userId);
                if (error) console.error('Erreur Supabase:', error);
                else console.log(`Utilisateur ${userId} → Pro`);
            }
        }

        return res.status(200).json({ received: true });
    } catch (error) {
        console.error('Erreur webhook:', error);
        return res.status(500).json({ error: 'Erreur interne' });
    }
}
