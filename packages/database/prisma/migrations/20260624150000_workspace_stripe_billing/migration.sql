-- Stripe billing (F8, MVP-SPEC §4F): link a workspace to its Stripe customer +
-- subscription so the webhook can flip `plan` free↔team. Additive — nullable; we
-- store only the linking ids, never card/money data (Stripe owns the money).

ALTER TABLE "workspace"
  ADD COLUMN "stripe_customer_id" TEXT,
  ADD COLUMN "stripe_subscription_id" TEXT;

CREATE UNIQUE INDEX "workspace_stripe_customer_id_key" ON "workspace"("stripe_customer_id");
