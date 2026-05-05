const ALLOWED_AMOUNTS = [3, 5, 10];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, amount } = req.body || {};
  const tipAmount = parseInt(amount);

  if (!ALLOWED_AMOUNTS.includes(tipAmount)) {
    return res.status(400).json({ error: 'Invalid tip amount' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(200).json({ url: null, mock: true, message: 'Stripe not configured' });
  }

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      submit_type: 'donate',
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: tipAmount * 100,
          product_data: {
            name: `Support HomeWOD — $${tipAmount} tip`,
            description: 'Keeps the AI workouts free for everyone'
          }
        },
        quantity: 1
      }],
      customer_email: email || undefined,
      success_url: 'https://homewod.fit/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://homewod.fit/?cancelled=true'
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: err.message });
  }
};
