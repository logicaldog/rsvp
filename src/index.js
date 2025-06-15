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

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'POST' && new URL(request.url).pathname === '/submit') {
      try {
        const data = await request.json();

        // Minimal validation
        if (!isAlphaOrSpace(data.firstName) || !isAlphaOrSpace(data.lastName)) {
          return jsonError("Please enter a valid first and last name (letters, spaces, hyphens, apostrophes only).");
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

        // Store in KV
        const timestamp = Date.now();
        const key = `rsvp:${timestamp}`;
        await env.REUNION_KV.put(key, JSON.stringify(data));

        // Email to reunion team
        await fetch('https://api.mailchannels.net/tx/v1/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            personalizations: [{
              to: [{ email: 'reunionteam@anacortes1975.com' }],
              dkim_domain: "anacortes1975.com",
              dkim_selector: "mailchannels",
              dkim_private_key: env.DKIM_PRIVATE_KEY
            }],
            from: { email: 'noreply@anacortes1975.com', name: 'AHS 1975 Reunion' },
            subject: 'New RSVP Submission',
            content: [{
              type: 'text/plain',
              value: JSON.stringify(data, null, 2)
            }]
          })
        });

        // Optional: Email to registrant
        if (hasEmail) {
          await fetch('https://api.mailchannels.net/tx/v1/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              personalizations: [{
                to: [{ email: data.email }]
              }],
              from: { email: 'noreply@anacortes1975.com', name: 'AHS 1975 Reunion' },
              subject: 'Your RSVP was received',
              content: [{
                type: 'text/plain',
                value: 'Thanks for RSVPing! We’ve received your response and will be in touch with updates.'
              }]
            })
          });
        }

        return Response.redirect('https://rsvp.anacortes1975.com/thanks', 303);
      } catch (err) {
        return jsonError("Something went wrong processing your submission. Please try again.", 500);
      }
    }

    return new Response('Not Found', { status: 404 });
  }
};
