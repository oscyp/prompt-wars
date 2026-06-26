/* =========================================================
   Prompt Wars — Newsletter signup (Vercel Serverless Function)

   Proxies the waitlist form to Resend. The Resend API key is
   server-side only and must never reach the browser — that is
   the entire reason this endpoint exists.

   Environment variables (Vercel → Settings → Env Vars):
     RESEND_API_KEY   required — your Resend API key (starts with "re_")
     RESEND_FROM      optional — sender for the welcome email, e.g.
                      "Prompt Wars <hello@promptwars.gg>". Leave unset
                      until the domain is verified in Resend; the
                      signup still works without it.

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

    if (!r.ok) {
      // A repeat signup is a no-op for us — don't surface it as a failure.
      const detail = await r.text();
      if (r.status !== 409 && !/already|exist/i.test(detail)) {
        console.error('subscribe: Resend responded', r.status, detail);
        return res.status(502).json({ error: 'Could not subscribe right now. Please try again.' });
      }
    }

    // Best-effort welcome email. Requires a verified sending domain in
    // Resend; if it can't send we log it but keep the signup successful.
    if (process.env.RESEND_FROM) {
      await sendWelcomeEmail(apiKey, process.env.RESEND_FROM, email);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('subscribe: request failed', err);
    return res.status(502).json({ error: 'Could not subscribe right now. Please try again.' });
  }
};

async function sendWelcomeEmail(apiKey, from, email) {
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: email,
        subject: "You're on the Prompt Wars waitlist 🎮",
        html: WELCOME_HTML,
      }),
    });
    if (!r.ok) {
      console.error('subscribe: welcome email failed', r.status, await r.text());
    }
  } catch (err) {
    // Never let the welcome email take down the signup.
    console.error('subscribe: welcome email error', err);
  }
}

const WELCOME_HTML = [
  '<div style="background:#0B0B0F;padding:40px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">',
  '  <div style="max-width:480px;margin:0 auto;background:#15151c;border:1px solid #26262e;border-radius:16px;padding:40px 32px;color:#e7e7ea;">',
  '    <h1 style="margin:0 0 16px;font-size:22px;color:#ffffff;">You\'re on the list 🎮</h1>',
  '    <p style="margin:0 0 16px;line-height:1.6;color:#b6b6bf;">Thanks for joining the <strong style="color:#8B5CF6;">Prompt Wars</strong> waitlist. You\'ll be the first to know the moment we launch on iOS and Android.</p>',
  '    <p style="margin:0 0 24px;line-height:1.6;color:#b6b6bf;">Until then — sharpen your prompts. ⚔️</p>',
  '    <p style="margin:0;font-size:13px;color:#6b6b76;">— The Prompt Wars team · <a href="https://promptwars.gg" style="color:#8B5CF6;text-decoration:none;">promptwars.gg</a></p>',
  '  </div>',
  '</div>',
].join('');
