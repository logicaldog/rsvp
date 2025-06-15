export default {
  async fetch(request, env, ctx) {
    if (request.method === 'GET') {
      console.log("📬 Sending MailChannels test email...");

      const res = await fetch('https://api.mailchannels.net/tx/v1/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{
            to: [{ email: "sean@fiftyfathom.com" }]
          }],
          from: {
            email: "noreply@anacortes1975.com",
            name: "AHS 1975 Reunion"
          },
          subject: "✅ MailChannels Test from Cloudflare Worker",
          content: [{
            type: "text/plain",
            value: "This is a test email sent via MailChannels from your Worker."
          }],
          dkim_domain: "anacortes1975.com",
          dkim_selector: "mailchannels",
          dkim_private_key: env.DKIM_PRIVATE_KEY
        })
      });

      const body = await res.text();
      console.log("📤 MailChannels response status:", res.status);
      console.log("📤 MailChannels response body:", body);

      return new Response("✅ Test email attempted. Check logs and inbox.");
    }

    return new Response("Use GET to trigger email test.");
  }
};
