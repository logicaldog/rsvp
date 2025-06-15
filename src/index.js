function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function isValidPhone(phone) {
  return /^\+?[0-9\s\-().]{7,20}$/.test(phone);
}
function isAlphaOrSpace(str) {
  return /^[a-zA-Z\s'\-]{1,50}$/.test(str);
}
function isValidChoice(val) {
  return ["Yes", "No", "Maybe"].includes(val);
}
function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
async function serveAsset(path) {
  const page = await fetch(`https://raw.githubusercontent.com/logicaldog/rsvp/main/${path}`);
  if (page.ok) {
    return new Response(await page.text(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  } else {
    return new Response('Page not found', { status: 404 });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'GET') {
      if (url.pathname === '/' || url.pathname === '/index.html') return serveAsset('index.html');
      if (url.pathname === '/rsvp.html') return serveAsset('rsvp.html');
      if (url.pathname === '/thanks.html') return serveAsset('thanks.html');
      return new Response('Not Found', { status: 404 });
    }

    if (request.method === 'POST' && url.pathname === '/submit') {
      try {
        let data = {};
        const contentType = request.headers.get('content-type') || '';
        if (contentType.includes('application/x-www-form-urlencoded')) {
          const formData = await request.formData();
          data = Object.fromEntries(formData.entries());
        } else {
          return jsonError("Unsupported content type", 415);
        }

        // Validation
        if (!isAlphaOrSpace(data.firstName) || !isAlphaOrSpace(data.lastName)) {
          return jsonError("Please enter a valid first and last name.");
        }
        const hasEmail = data.email && isValidEmail(data.email);
        const hasPhone = data.phone && isValidPhone(data.phone);
        if (!hasEmail && !hasPhone) {
          return jsonError("Please provide a valid email or phone.");
        }
        if (!["football", "pizza", "dinner", "bbq"].every(key => isValidChoice(data[key]))) {
          return jsonError("Invalid attendance choices.");
        }
        if (data.comments && data.comments.length > 500) {
          return jsonError("Comments too long.");
        }

        // KV Store
        const timestamp = Date.now();
        const key = `rsvp:${timestamp}`;
        console.log("✅ Validation passed. Proceeding to KV write...");
        await env.REUNION_KV.put(key, JSON.stringify(data));
        console.log("✅ KV write complete. Sending Mailgun email...");

        const mailgunDomain = 'anacortes1975.com';
        const base64API = btoa(`api:${env.MAILGUN_API_KEY}`);

        // Notify organizer
        const notifyBody = new URLSearchParams({
          from: `AHS 1975 Reunion <noreply@${mailgunDomain}>`,
          to: 'reunionteam@anacortes1975.com',
          subject: 'New RSVP Submission',
          text: JSON.stringify(data, null, 2)
        });

        const notifyRes = await fetch(`https://api.mailgun.net/v3/${mailgunDomain}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${base64API}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: notifyBody.toString()
        });

        console.log("📤 Notification status:", notifyRes.status);
        const notifyText = await notifyRes.text();
        console.log("📤 Notification response:", notifyText);

        // Confirmation to registrant
        if (hasEmail) {
          const confirmBody = new URLSearchParams({
            from: `AHS 1975 Reunion <noreply@${mailgunDomain}>`,
            to: data.email,
            subject: 'Your RSVP was received',
            text: 'Thanks for RSVPing! We’ll be in touch with updates.'
          });

          const confirmRes = await fetch(`https://api.mailgun.net/v3/${mailgunDomain}/messages`, {
            method: 'POST',
            headers: {
              Authorization: `Basic ${base64API}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: confirmBody.toString()
          });

          console.log("📬 Confirmation email status:", confirmRes.status);
          console.log("📬 Confirmation email response:", await confirmRes.text());
        }

        console.log("✅ Emails sent. Redirecting...");
        return Response.redirect(new URL('/thanks.html', request.url), 303);

      } catch (err) {
        console.error("RSVP Submission Error:", err);
        return jsonError("Something went wrong processing your submission.", 500);
      }
    }

    return new Response('Not Found', { status: 404 });
  }
};
