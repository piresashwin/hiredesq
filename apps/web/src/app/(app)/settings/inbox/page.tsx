import { InboxSettings } from "@/components/settings/InboxSettings";

// Forwarding inbox (F9). The workspace's email-ingest address — forward a CV or
// chat there and it lands parsed in the pool. Reached from the account menu.
// Live-backed by getInboxAddress() / regenerateInboxAddress().
export default function InboxSettingsRoute() {
  return <InboxSettings />;
}
