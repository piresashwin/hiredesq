import { Suspense } from "react";
import { BillingPage } from "@/components/billing/BillingPage";

// Credits / Upgrade (design-system §6.8, MVP-SPEC §4) — live, backed by getCredits().
// Reached from the credit-meter pill in the top bar. An upgrade invitation, never
// a paywall; the DB/search/jobs/revenue are stated as free forever. The CTA opens
// real Stripe Checkout (F8); the Stripe return lands here as ?upgrade=success|cancelled.
// Suspense boundary: BillingPage reads useSearchParams (the Stripe return param).
export default function BillingRoute() {
  return (
    <Suspense>
      <BillingPage />
    </Suspense>
  );
}
