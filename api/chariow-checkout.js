export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { userId, email } = req.body;

        const response = await fetch('https://api.chariow.com/v1/checkout', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.CHARIOW_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                product_id: 'prd_q4bbfvu6',
                email: email || 'user@facturo.app',
                first_name: 'Utilisateur',
                last_name: 'Facturo',
                phone: { number: '770000000', country_code: 'SN' },
                redirect_url: `https://facturo-ten.vercel.app/?payment=success&user_id=${userId}`,
                custom_metadata: { user_id: userId, source: 'facturo_app' }
            })
        });

        const result = await response.json();
        console.log('Chariow response:', JSON.stringify(result));

        if (!response.ok) {
            return res.status(response.status).json({ 
                error: result.message || 'Erreur Chariow',
                details: result
            });
        }

        const checkoutUrl = result.data?.payment?.checkout_url;
        if (checkoutUrl) {
            return res.status(200).json({ url: checkoutUrl });
        } else if (result.data?.step === 'completed') {
            return res.status(200).json({ completed: true });
        } else {
            return res.status(200).json({ 
                error: 'Lien indisponible',
                raw: result
            });
        }

    } catch (error) {
        console.error('Erreur:', error.message);
        return res.status(500).json({ error: error.message });
    }
}
