import { Module } from "@nestjs/common";
import { CreditsController } from "./credits.controller.js";
import { CreditsService } from "./credits.service.js";

// PrismaService + guards come from the @Global() CommonModule. CreditsService is
// exported so ingest/uploads can run the out-of-credits pre-check (§4).
@Module({
  controllers: [CreditsController],
  providers: [CreditsService],
  exports: [CreditsService],
})
export class CreditsModule {}
