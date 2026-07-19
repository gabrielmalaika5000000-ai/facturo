import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { userId } = req.body;

        // Récupérer les infos utilisateur depuis Supabase
        const sb = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY
        );
        
        const { data: profile } = await sb
            .from('profiles')
            .select('email, company_name')
            .eq('id', userId)
            .single();

        const email = profile?.email || 'user@facturo.app';
        const firstName = profile?.company_name?.split(' ')[0] || 'Utilisateur';
        const lastName = profile?.company_name?.split(' ')[1] || 'Facturo';

        const response = await fetch('https://api.chariow.com/v1/checkout', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.CHARIOW_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                product_id: 'prd_q4bbfvu6',
                email: email,
                first_name: firstName,
                last_name: lastName,
                phone: { number: '770000000', country_code: 'SN' },
                redirect_url: `https://facturo-ten.vercel.app/?payment=success&user_id=${userId}`,
                custom_metadata: { user_id: userId, source: 'facturo_app' }
            })
        });

        const result = await response.json();
        console.log('Chariow response:', JSON.stringify(result));

        if (!response.ok) {
            console.error('Chariow error:', result);
            return res.status(response.status).json({ error: result.message || 'Erreur Chariow' });
        }

        const checkoutUrl = result.data?.payment?.checkout_url;
        if (checkoutUrl) {
            return res.status(200).json({ url: checkoutUrl });
        } else if (result.data?.step === 'completed') {
            return res.status(200).json({ completed: true });
        } else {
            return res.status(200).json({ error: 'Lien de paiement indisponible', raw: result });
        }

    } catch (error) {
        console.error('Erreur:', error);
        return res.status(500).json({ error: error.message });
    }
}
