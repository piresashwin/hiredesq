// The browser's detected IANA timezone (e.g. "Asia/Dubai"), or undefined when the
// runtime can't resolve one. Sent on signup so the API can seed the new user's
// timezone preference and derive a default country (see SignupInput.timezone). Only
// the browser reliably knows this, so detection has to happen client-side.
export function detectTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}
