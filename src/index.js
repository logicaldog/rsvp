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
      if (url.pathname === '/' || url.pathname === '/index.html') {
        return serveAsset('index.html');
      }
      if (url.pathname === '/rsvp.html') {
        return serveAsset('rsvp.html');
      }
      if (url.pathname === '/thanks.html') {
        return serveAsset('thanks.html');
      }
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

        if (!isAlphaOrSpace(data.firstName) || !isAlphaOrSpace(data.lastName)) {
          return jsonError("Please enter a valid first and last name.");
        }

        const hasEmail = data.email && isValidEmail(data.email);
        const hasPhone = data.phone && isValidPhone(data.phone);
        if (!hasEmail && !hasPhone) {
          return jsonError("Please provide a valid email or phone number.");
        }

        if (!["football", "pizza", "dinner", "bbq"].every(k => isValidChoice(data[k]))) {
          return jsonError("Please select Yes, No, or Maybe for all attendance questions.");
        }

        if (data.comments && data.comments.length > 500) {
          return jsonError("Comments must be 500 characters or fewer.");
        }

        const timestamp = Date.now();
        const key = `rsvp:${timestamp}`;
        console.log("✅ Validation passed. Proceeding to KV write...");
        await env.REUNION_KV.put(key, JSON.stringify(data));

        // Notify the team via Resend
        console.log("✅ KV write complete. Sending notification email...");
        const notifyRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: "reunion@anacortes1975.com",
            to: ["reunionteam@anacortes1975.com"],
            reply_to: "reunion@anacortes1975.com",
            subject: "New RSVP Submission",
            text: JSON.stringify(data, null, 2)
          })
        });

        const notifyBody = await notifyRes.text();
        console.log("📤 Resend notification status:", notifyRes.status);
        console.log("📤 Resend response body:", notifyBody);

        // Optional confirmation to registrant
        if (hasEmail) {
          console.log("📬 Sending confirmation email to registrant:", data.email);
          const confirmRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.RESEND_API_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              from: "reunion@anacortes1975.com",
              to: [data.email],
              reply_to: "reunion@anacortes1975.com",
              subject: "Your RSVP was received",
              text: "Thanks for RSVPing! We’ve received your response and will be in touch with updates."
            })
          });

          const confirmBody = await confirmRes.text();
          console.log("📬 Confirmation email status:", confirmRes.status);
          console.log("📬 Confirmation email body:", confirmBody);
        }

        return Response.redirect(new URL('/thanks.html', request.url), 303);
      } catch (err) {
        console.error("RSVP Submission Error:", err);
        return jsonError("Something went wrong processing your submission.", 500);
      }
    }

    return new Response('Not Found', { status: 404 });
  }
};
