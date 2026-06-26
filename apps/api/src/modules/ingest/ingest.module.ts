import { Module } from "@nestjs/common";
import { QueueService } from "../../common/queue.service.js";
import { CreditsModule } from "../credits/credits.module.js";
import { IngestController } from "./ingest.controller.js";
import { IngestService } from "./ingest.service.js";

// PrismaService + guards come from the @Global() CommonModule; QueueService is
// local to ingest. CreditsModule provides the out-of-credits pre-check (§4).
@Module({
  imports: [CreditsModule],
  controllers: [IngestController],
  providers: [IngestService, QueueService],
  // Exported so the forwarding-inbox webhook (F9) can reuse the paste path.
  exports: [IngestService],
})
export class IngestModule {}
