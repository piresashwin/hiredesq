import { RevenueDashboard } from "@/components/revenue/RevenueDashboard";

// Revenue dashboard (the differentiator, design-system §6.6) — LIVE: loads the
// revenue summary + placements from the API. Hero "booked this month" +
// reconciling placements table.
export default function RevenuePage() {
  return <RevenueDashboard />;
}
