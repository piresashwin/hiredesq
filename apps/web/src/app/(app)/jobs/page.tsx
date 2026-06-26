import { JobsIndex } from "@/components/jobs/JobsIndex";

// Jobs index (design-system §6.5) — live (listJobs). Dense, scannable job rows
// with a stage-distribution mini-bar + pipeline value; click through to a per-job
// Kanban board.
export default function JobsPage() {
  return <JobsIndex />;
}
