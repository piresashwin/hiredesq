import { CustomFieldsSettings } from "@/components/settings/CustomFieldsSettings";

// Settings → Candidate fields. Workspace-level config for the extra fields shown on
// every candidate's Personal-details tab. Reached from the account menu. Live-backed
// by listCustomFields() / createCustomField() / updateCustomField() / deleteCustomField().
export default function CustomFieldsSettingsRoute() {
  return <CustomFieldsSettings />;
}
