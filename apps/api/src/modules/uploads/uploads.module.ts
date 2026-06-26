import { Module } from "@nestjs/common";
import { QueueService } from "../../common/queue.service.js";
import { CreditsModule } from "../credits/credits.module.js";
import { UploadsController } from "./uploads.controller.js";
import { UploadsService } from "./uploads.service.js";

// PrismaService + guards + StorageService come from the @Global() CommonModule;
// QueueService is local (matches the ingest module). CreditsModule provides the
// out-of-credits pre-check for the AI-parse upload paths (§4).
@Module({
  imports: [CreditsModule],
  controllers: [UploadsController],
  providers: [UploadsService, QueueService],
  // Exported so the forwarding-inbox webhook (F9) can reuse the store+enqueue path.
  exports: [UploadsService],
})
export class UploadsModule {}
