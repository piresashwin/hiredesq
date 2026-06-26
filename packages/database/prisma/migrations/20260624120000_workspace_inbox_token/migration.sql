-- Forwarding inbox (F9, MVP-SPEC §2A): each workspace's unguessable ingest-address
-- local-part. Additive — nullable + unique, lazily minted on first request.

ALTER TABLE "workspace" ADD COLUMN "inbox_token" TEXT;

CREATE UNIQUE INDEX "workspace_inbox_token_key" ON "workspace"("inbox_token");
