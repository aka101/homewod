module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionId } = req.body || {};

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(200).json({ verified: true, mock: true });
  }

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid') {
      return res.status(200).json({
        verified: true,
        email: session.customer_email,
        planName: 'HomeWOD Pro'
      });
    }

    return res.status(200).json({ verified: false });

  } catch (err) {
    console.error('Verify session error:', err);
    return res.status(200).json({ verified: false, error: err.message });
  }
};
