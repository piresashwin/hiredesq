# Stripe billing setup (F8)

How to wire the team-plan upgrade. The app code is provider-bound to Stripe but
**inert until these are set** — checkout/portal/webhook return a clear error
otherwise, so the rest of the app runs fine without billing configured.

> Operator actions (Stripe dashboard + API host) — not run from this repo, per the
> deploy rules. The app never stores card data or computes money; Stripe owns the
> money. We store only `stripe_customer_id` / `stripe_subscription_id` and flip
> `workspace.plan` from the signed webhook.

## What the code expects

| Env (on `apps/api`) | What |
|---|---|
| `STRIPE_SECRET_KEY` | Secret API key (`sk_test_…` / `sk_live_…`). |
| `STRIPE_TEAM_PRICE_ID` | The recurring **price** id for the team plan (`price_…`). |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the webhook endpoint (`whsec_…`). |
| `APP_URL` | Web origin for checkout return URLs (e.g. `https://app.hiredesq.com`). |

Endpoints the app exposes:
- `POST /workspaces/:id/billing/checkout` → returns a Stripe Checkout URL (owner-only).
- `POST /workspaces/:id/billing/portal` → returns a Stripe billing-portal URL (owner-only).
- `POST /billing/stripe-webhook` → **public**, Stripe-signature-verified; flips the plan.

## One-time setup

1. **Product + price.** Stripe dashboard → Products → create "hiredesq Team" with a
   **recurring** price. Copy the price id (`price_…`) → `STRIPE_TEAM_PRICE_ID`.
2. **API key.** Developers → API keys → copy the secret key → `STRIPE_SECRET_KEY`.
3. **Webhook endpoint.** Developers → Webhooks → Add endpoint:
   - URL: `https://hiredesq.com/api/billing/stripe-webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`.
   - Copy the signing secret (`whsec_…`) → `STRIPE_WEBHOOK_SECRET`.
4. **Billing portal.** Settings → Billing → Customer portal → activate (lets a
   recruiter manage/cancel via the `/portal` link).
5. **Set the env** on the API host and restart. Set `APP_URL` to the web origin.

## Verify (test mode)

- Use a test key + test price. In the app: Settings → Billing → Upgrade → complete
  Stripe Checkout with card `4242 4242 4242 4242`.
- The webhook flips `workspace.plan` to `team`; the credit meter shows the lifted cap.
- Local webhook testing: `stripe listen --forward-to localhost:3001/billing/stripe-webhook`
  (the CLI prints a `whsec_…` to use as `STRIPE_WEBHOOK_SECRET` for local runs).
- Cancel via the portal → `customer.subscription.deleted` flips the plan back to `free`.

## Notes

- The plan flip is **idempotent** (Stripe redelivers events; set-state is safe to
  repeat). The webhook resolves the workspace from `checkout.session` metadata, then
  from `stripe_customer_id` for subscription events.
- Secrets live only in the API env + Stripe dashboard — never in git or logs (§6).
- "Team **seats/roles/shared pipelines**" is a separate deferred item — F8 is only
  payment + the plan flip + lifting the paid submission cap.
