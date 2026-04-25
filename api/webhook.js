const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  switch (event.type) {

    case 'checkout.session.completed': {
      const session = event.data.object;
      const email = session.customer_email;
      const sessionId = session.id;
      const amount = session.amount_total / 100;
      console.log(`✅ New Pro subscriber!\nEmail: ${email}\nSession: ${sessionId}\nAmount: $${amount}`);
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      console.log(`❌ Subscription cancelled\nCustomer: ${sub.customer}\nEnded: ${new Date(sub.ended_at * 1000).toISOString()}`);
      break;
    }

    case 'customer.subscription.updated': {
      const updated = event.data.object;
      console.log(`📝 Subscription updated\nStatus: ${updated.status}\nCustomer: ${updated.customer}`);
      break;
    }

    default:
      console.log(`Unhandled event: ${event.type}`);
  }

  return res.status(200).json({ received: true });
}

// Tell Vercel not to parse the body — raw bytes needed for signature verification
handler.config = { api: { bodyParser: false } };

module.exports = handler;
