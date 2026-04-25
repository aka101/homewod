module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // Accepts events silently — extend later to store in a DB or send to a service
  const { event, timestamp } = req.body || {};
  console.log(`Analytics event: ${event} at ${timestamp}`);
  return res.status(200).json({ ok: true });
};
