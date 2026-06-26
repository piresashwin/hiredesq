import type { CandidateSource } from "@hiredesq/shared";
import { cn } from "@/lib/cn";
import { ChatIcon, FileIcon, MailIcon, UploadCloudIcon, UsersIcon } from "@/components/ui/Icon";

// Source provenance, glanceable in dense rows (design-system §6.8). Tiny icon +
// label so the recruiter sees where a candidate came from without decoding.

const SOURCE: Record<CandidateSource, { label: string; Icon: typeof ChatIcon }> = {
  whatsapp_paste: { label: "WhatsApp", Icon: ChatIcon },
  email_forward: { label: "Email", Icon: MailIcon },
  resume_upload: { label: "Resume", Icon: FileIcon },
  bulk_import: { label: "Import", Icon: UploadCloudIcon },
  manual: { label: "Manual", Icon: UsersIcon },
};

function resolve(source: string) {
  return SOURCE[source as CandidateSource] ?? SOURCE.manual;
}

/** Compact icon-only marker for table rows. */
export function SourceIcon({ source, className }: { source: string; className?: string }) {
  const { label, Icon } = resolve(source);
  return <Icon className={cn("h-3.5 w-3.5 text-muted", className)} title={`Source: ${label}`} />;
}

/** Icon + label chip for the profile header. */
export function SourceBadge({ source, className }: { source: string; className?: string }) {
  const { label, Icon } = resolve(source);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm bg-subtle px-1.5 py-0.5 text-label text-muted",
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
