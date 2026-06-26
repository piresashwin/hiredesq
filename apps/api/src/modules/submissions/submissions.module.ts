import { Module } from "@nestjs/common";
import { CreditsModule } from "../credits/credits.module.js";
import { SharedSubmissionsController, SubmissionsController } from "./submissions.controller.js";
import { SubmissionsService } from "./submissions.service.js";

// PrismaService + guards come from the @Global() CommonModule. CreditsModule
// provides the daily-credit gate for generation (Model B, §4).
@Module({
  imports: [CreditsModule],
  controllers: [SubmissionsController, SharedSubmissionsController],
  providers: [SubmissionsService],
})
export class SubmissionsModule {}
