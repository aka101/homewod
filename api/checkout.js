module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body || {};

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(200).json({
      url: null,
      mock: true,
      message: 'Stripe not configured'
    });
  }

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{
        price: process.env.STRIPE_PRICE_ID,
        quantity: 1
      }],
      customer_email: email || undefined,
      success_url:
        'https://homewod.fit/success' +
        '?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://homewod.fit/?cancelled=true',
      allow_promotion_codes: true,
      subscription_data: {
        metadata: {
          source: 'homewod_web'
        }
      }
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: err.message });
  }
};
