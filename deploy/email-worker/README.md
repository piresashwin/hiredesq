# Forwarding inbox — Cloudflare Email Worker (F9)

The email front for hiredesq's forwarding inbox. Recruiters forward a CV (or a chat)
to `<token>@inbox.hiredesq.com` and it lands parsed in their workspace; plus-addressing
(`<token>+<jobId>@inbox.hiredesq.com`) attaches it to a specific position (F7).

This Worker is the ONLY piece that touches raw MIME. It parses the message and POSTs
hiredesq's normalized `InboundEmailPayload` to the API (`POST /inbound/email`). The
API stays provider-agnostic — to swap to Postmark/Mailgun later, replace this Worker
with an adapter that POSTs the same shape; the API is unchanged.

## How it fits together

```
forwarded email → MX (inbox.hiredesq.com) → Cloudflare Email Routing (catch-all)
  → this Email Worker (postal-mime parse → normalized JSON)
  → POST https://hiredesq.com/api/inbound/email  (Authorization: Bearer <secret>)
  → API resolves workspace from the address token → existing parse pipeline
```

## One-time setup

> Per the project's deploy rules these are **operator actions** on Cloudflare + the
> API host — not run from this repo automatically.

1. **Pick the inbox domain/subdomain** (default `inbox.hiredesq.com`). It must be a
   zone (or subdomain) on Cloudflare.
2. **Enable Email Routing** for that zone (Cloudflare dashboard → Email → Email
   Routing). This provisions the required **MX** + SPF records automatically.
3. **Generate the shared secret** (both sides must match):
   ```sh
   openssl rand -hex 32
   ```
4. **API env** (the deployed `apps/api`): set
   - `INBOUND_WEBHOOK_SECRET=<the secret>`
   - `INBOX_DOMAIN=inbox.hiredesq.com` (must match the address domain)
5. **Deploy the Worker:**
   ```sh
   cd deploy/email-worker
   npm install
   npx wrangler secret put INBOUND_WEBHOOK_SECRET   # paste the same secret
   # set API_INBOUND_URL in wrangler.toml to the deployed API URL first
   npx wrangler deploy
   ```
6. **Route mail to the Worker:** Email Routing → Routing rules → **Catch-all** →
   action **Send to a Worker** → select `hiredesq-inbox`. (A catch-all is required
   because every workspace's token is a different local-part.)

## Verify

- In the app: Settings → copy the forwarding address; send a test email with a PDF
  attached. It should appear in the candidate pool within a few seconds.
- Worker logs: `npx wrangler tail`.
- API logs show `inbound accepted ws=… attachments=…` (ids/counts only — never content).

## Security notes (mirror the API invariants)

- The address is a **capability**: anyone who knows it can forward CVs into that
  workspace. It's an unguessable 96-bit token and is **rotatable** in Settings
  (rotating invalidates the old address).
- The Worker authenticates to the API with the **shared secret**; the API rejects any
  POST without it (constant-time check). Keep the secret only in Cloudflare secrets +
  the API env — never in `wrangler.toml` or git.
- Unknown address / over-quota / empty mail is **accepted-and-dropped** (HTTP 200) so
  the Worker never retries a permanent condition. Transient 5xx is retried.
- The API logs ids/counts only; raw email content + the token are never logged (§2/§6).
