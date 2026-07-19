exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    try {
        const { email, first_name, last_name, phone, user_id } = JSON.parse(event.body);

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
                redirect_url: `https://facturo-pro.netlify.app/?payment=success&user_id=${user_id}`,
                custom_metadata: { user_id, source: 'facturo_app' }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return { statusCode: response.status, headers, body: JSON.stringify({ error: data.message || 'Erreur Chariow' }) };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                step: data.data.step,
                checkout_url: data.data.payment?.checkout_url || null
            })
        };

    } catch (error) {
        console.error('Erreur chariow-checkout:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erreur interne' }) };
    }
};
