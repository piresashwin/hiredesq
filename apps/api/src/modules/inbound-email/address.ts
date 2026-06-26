// Parse a forwarding-inbox recipient into its routing parts (F9, §2A). Pure — no
// I/O, deterministically testable. Address shape:
//   <inboxToken>[+<jobId>]@<inboxDomain>
// Plus-addressing targets an open position (F7). Tolerates a "Name <addr>" wrapper.
// Returns null when the recipient isn't for our inbox domain.

export interface ParsedInboxAddress {
  inboxToken: string;
  /** Present when the address used +jobId plus-addressing (job-centric inbound). */
  jobId?: string;
}

export function parseInboxAddress(
  toAddress: string,
  inboxDomain: string,
): ParsedInboxAddress | null {
  if (!toAddress) return null;
  // Unwrap a "Display Name <local@domain>" form to the bare address.
  const angled = toAddress.match(/<([^>]+)>/);
  const addr = (angled ? angled[1]! : toAddress).trim();

  const at = addr.lastIndexOf("@");
  if (at <= 0) return null;
  const local = addr.slice(0, at).trim();
  const domain = addr.slice(at + 1).trim().toLowerCase();
  if (!local || domain !== inboxDomain.trim().toLowerCase()) return null;

  const plus = local.indexOf("+");
  // The token is lowercase hex (minted lowercase) — fold case so a forwarder that
  // rewrites the local-part still resolves.
  const inboxToken = (plus < 0 ? local : local.slice(0, plus)).trim().toLowerCase();
  if (!inboxToken) return null;

  const jobPart = plus < 0 ? "" : local.slice(plus + 1).trim();
  return jobPart ? { inboxToken, jobId: jobPart } : { inboxToken };
}
