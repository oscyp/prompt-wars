/* =========================================================
   Prompt Wars — Newsletter signup (Vercel Serverless Function)

   Proxies the waitlist form to Resend. The Resend API key is
   server-side only and must never reach the browser — that is
   the entire reason this endpoint exists.

   Required environment variable (Vercel → Settings → Env Vars):
     RESEND_API_KEY   your Resend API key (starts with "re_")

   Contacts are global in Resend (keyed by email); audience_id is
   deprecated, so we just create a global contact and organise with
   Segments/Topics in the dashboard.
   ========================================================= */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  const email = body && typeof body.email === 'string' ? body.email.trim() : '';

  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('subscribe: RESEND_API_KEY is not set');
    return res.status(500).json({ error: 'Server not configured.' });
  }

  try {
    const r = await fetch('https://api.resend.com/contacts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, unsubscribed: false }),
    });

    if (r.ok) {
      return res.status(200).json({ ok: true });
    }

    // A repeat signup is a no-op for us — don't surface it as a failure.
    const detail = await r.text();
    if (r.status === 409 || /already|exist/i.test(detail)) {
      return res.status(200).json({ ok: true });
    }

    console.error('subscribe: Resend responded', r.status, detail);
    return res.status(502).json({ error: 'Could not subscribe right now. Please try again.' });
  } catch (err) {
    console.error('subscribe: request failed', err);
    return res.status(502).json({ error: 'Could not subscribe right now. Please try again.' });
  }
};
