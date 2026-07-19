const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const payload = JSON.parse(event.body);
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

        return { statusCode: 200, body: JSON.stringify({ received: true }) };
    } catch (error) {
        return { statusCode: 500, body: 'Erreur interne' };
    }
};
