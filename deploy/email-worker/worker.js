// Cloudflare Email Worker — the forwarding-inbox front (F9, MVP-SPEC §2A).
//
// Bound to a Cloudflare Email Routing catch-all on inbox.hiredesq.com. For each
// inbound message it parses the raw MIME, builds hiredesq's PROVIDER-AGNOSTIC
// normalized payload, and POSTs it to the API webhook (POST /inbound/email),
// authenticated by a shared secret. The API resolves the workspace from the
// recipient's token and runs the candidate through the normal parse pipeline.
//
// The API never sees raw MIME — swapping to Postmark/Mailgun later means replacing
// only this file with an adapter that posts the same shape.
//
// Setup: see ./README.md (MX records, secrets, deploy).
import PostalMime from "postal-mime";

export default {
  /** @param {ForwardableEmailMessage} message */
  async email(message, env) {
    const email = await new PostalMime().parse(message.raw);

    const attachments = (email.attachments || []).map((a) => ({
      filename: a.filename || "attachment",
      contentType: a.mimeType || "application/octet-stream",
      contentBase64: toBase64(a.content),
    }));

    const payload = {
      // The envelope recipient — carries <token>[+jobId]@inbox.hiredesq.com.
      to: message.to,
      from: message.from,
      subject: email.subject || "",
      text: email.text || "",
      attachments,
    };

    const res = await fetch(env.API_INBOUND_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.INBOUND_WEBHOOK_SECRET}`,
      },
      body: JSON.stringify(payload),
    });

    // 5xx = transient → throw so Cloudflare retries. 2xx (incl. accepted:false for
    // unknown-address/over-quota) and 4xx (misconfig) = don't loop.
    if (res.status >= 500) {
      throw new Error(`inbound webhook ${res.status}`);
    }
  },
};

/** ArrayBuffer → base64 (resume-sized attachments). */
function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
