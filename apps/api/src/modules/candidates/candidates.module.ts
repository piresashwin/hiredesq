import { Module } from "@nestjs/common";
import { CandidatesController } from "./candidates.controller.js";
import { CandidatesService } from "./candidates.service.js";

// PrismaService + guards come from the @Global() CommonModule.
@Module({
  controllers: [CandidatesController],
  providers: [CandidatesService],
  // Exported so the dedup-review module can reuse remove() (delete + files, §2).
  exports: [CandidatesService],
})
export class CandidatesModule {}
