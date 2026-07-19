export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { email, first_name, last_name, phone, user_id } = req.body;

        const response = await fetch('https://api.chariow.com/v1/checkout', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.CHARIOW_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                product_id: 'prd_q4bbfvu6',
                email,
                first_name: first_name || email.split('@')[0],
                last_name: last_name || 'User',
                phone: { number: phone || '770000000', country_code: 'SN' },
                redirect_url: `https://facturo-app.vercel.app/?payment=success&user_id=${user_id}`,
                custom_metadata: { user_id, source: 'facturo_app' }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ error: data.message || 'Erreur Chariow' });
        }

        return res.status(200).json({
            step: data.data.step,
            checkout_url: data.data.payment?.checkout_url || null
        });

    } catch (error) {
        console.error('Erreur chariow-checkout:', error);
        return res.status(500).json({ error: 'Erreur interne' });
    }
}
