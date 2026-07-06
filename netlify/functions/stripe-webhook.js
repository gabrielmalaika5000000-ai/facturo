require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
    const sig = event.headers['stripe-signature'];
    let stripeEvent;

    try {
        stripeEvent = stripe.webhooks.constructEvent(event.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error(`Erreur signature webhook: ${err.message}`);
        return { statusCode: 400, body: `Webhook Error: ${err.message}` };
    }

    try {
        switch (stripeEvent.type) {
            case 'checkout.session.completed': {
                const session = stripeEvent.data.object;
                const userId = session.client_reference_id;
                const customerId = session.customer;
                const subscriptionId = session.subscription;

                if (userId) {
                    const { error } = await supabase
                        .from('profiles')
                        .update({ 
                            plan: 'pro', 
                            stripe_customer_id: customerId,
                            stripe_subscription_id: subscriptionId
                        })
                        .eq('id', userId);

                    if (error) console.error('Erreur MAJ Supabase:', error);
                    console.log(`Utilisateur ${userId} passé en Pro`);
                }
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = stripeEvent.data.object;
                const customerId = subscription.customer;

                const { error } = await supabase
                    .from('profiles')
                    .update({ plan: 'free', stripe_subscription_id: null })
                    .eq('stripe_customer_id', customerId);

                if (error) console.error('Erreur MAJ Supabase:', error);
                console.log(`Client ${customerId} rétrogradé en Free`);
                break;
            }

            default:
                console.log(`Événement non géré: ${stripeEvent.type}`);
        }

        return { statusCode: 200, body: JSON.stringify({ received: true }) };
    } catch (error) {
        console.error('Erreur traitement webhook:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
    }
};
