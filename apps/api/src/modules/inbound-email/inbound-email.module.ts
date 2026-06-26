import { Module } from "@nestjs/common";
import { UploadsModule } from "../uploads/uploads.module.js";
import { IngestModule } from "../ingest/ingest.module.js";
import { InboundEmailController, InboxController } from "./inbound-email.controller.js";
import { InboundEmailService } from "./inbound-email.service.js";

// Reuses UploadsService (attachments) + IngestService (body paste) — the forwarding
// inbox is the shipped ingest pipeline with an email front (F9). PrismaService +
// guards come from the @Global() CommonModule.
@Module({
  imports: [UploadsModule, IngestModule],
  controllers: [InboundEmailController, InboxController],
  providers: [InboundEmailService],
})
export class InboundEmailModule {}
