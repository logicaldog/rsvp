// src/index.js
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
          return jsonError("Please enter a valid first and last name (letters, spaces, hyphens, apostrophes only)."
          );
        }

        const hasEmail = data.email && isValidEmail(data.email);
        const hasPhone = data.phone && isValidPhone(data.phone);
        if (!hasEmail && !hasPhone) {
          return jsonError("Please provide a valid email address or phone number so we can contact you.");
        }

        if (!["football", "pizza", "dinner", "bbq"].every(key => isValidChoice(data[key]))) {
          return jsonError("Please select Yes, No, or Maybe for all attendance questions.");
        }

        if (data.comments && data.comments.length > 500) {
          return jsonError("Comments must be 500 characters or fewer.");
        }

        const timestamp = Date.now();
        const key = `rsvp:${timestamp}`;
        console.log("✅ Validation passed. Proceeding to KV write...");
        await env.REUNION_KV.put(key, JSON.stringify(data));

        // Notification email
        const summary = `\nNew RSVP Submission:\n\nName: ${data.firstName} ${data.lastName}${data.maidenName ? ` (${data.maidenName})` : ''}\nEmail: ${data.email || 'N/A'}\nPhone: ${data.phone || 'N/A'}\nAddress: ${data.address || ''}, ${data.city || ''}, ${data.state || ''} ${data.zip || ''}\n\nAttendance Plans:\n- Football Game: ${data.football}\n- Village Pizza: ${data.pizza}\n- Saturday Dinner: ${data.dinner}\n- Sunday BBQ: ${data.bbq}\n\nComments:\n${data.comments || '(none)'}\n\n--- Raw JSON ---\n${JSON.stringify(data, null, 2)}\n`;

        console.log("📤 Sending Mailgun email...");
        const notifyRes = await fetch('https://api.mailgun.net/v3/anacortes1975.com/messages', {
          method: 'POST',
          headers: {
            Authorization: `Basic ${btoa(`api:${env.MAILGUN_API_KEY}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            from: 'reunionteam@anacortes1975.com',
            to: 'reunionteam@anacortes1975.com',
            subject: 'New RSVP Submission',
            text: summary,
            'h:Reply-To': 'reunionteam@anacortes1975.com'
          })
        });
        console.log("📤 Notification status:", notifyRes.status);
        console.log("📤 Notification response:", await notifyRes.text());

        // Confirmation email
        if (hasEmail) {
          const confirmationText = `\nHi ${data.firstName},\n\nThanks for RSVPing to the AHS Class of 1975 Reunion!\nWe’ve received your response and will be in touch later this summer with more details and reminders.\n\nIf you’re planning to attend the Saturday dinner, please visit:\nhttps://registration.anacortes1975.com to register and purchase your tickets.\n\n– The Reunion Team\n`;

          console.log("📬 Sending confirmation email to registrant:", data.email);
          const confirmRes = await fetch('https://api.mailgun.net/v3/anacortes1975.com/messages', {
            method: 'POST',
            headers: {
              Authorization: `Basic ${btoa(`api:${env.MAILGUN_API_KEY}`)}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
              from: 'reunionteam@anacortes1975.com',
              to: data.email,
              subject: 'Thanks for your RSVP!',
              text: confirmationText,
              'h:Reply-To': 'reunionteam@anacortes1975.com'
            })
          });
          console.log("📬 Confirmation email status:", confirmRes.status);
          console.log("📬 Confirmation email response:", await confirmRes.text());
        }

        console.log("✅ Emails sent. Redirecting...");
        return Response.redirect(new URL('/thanks.html', request.url), 303);
      } catch (err) {
        console.error("RSVP Submission Error:", err);
        return jsonError("Something went wrong processing your submission. Please try again.", 500);
      }
    }

    return new Response('Not Found', { status: 404 });
  }
};
