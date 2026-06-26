import { HomeDashboard } from "@/components/home/HomeDashboard";

// The account-at-a-glance home — the signed-in landing. Not an analytics wall:
// a warm welcome, the cleared-revenue headline, and the few things that need the
// recruiter today (MVP-SPEC §3 keeps vanity analytics deferred).
export default function HomePage() {
  return <HomeDashboard />;
}
