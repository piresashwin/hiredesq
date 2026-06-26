import { Module } from "@nestjs/common";
import { CandidatesModule } from "../candidates/candidates.module.js";
import { DuplicatesController } from "./duplicates.controller.js";
import { DuplicatesService } from "./duplicates.service.js";

// PrismaService + guards come from the @Global() CommonModule; CandidatesModule
// supplies CandidatesService so confirm-merge can delete the merged-away
// candidate + its files (§2).
@Module({
  imports: [CandidatesModule],
  controllers: [DuplicatesController],
  providers: [DuplicatesService],
})
export class DuplicatesModule {}
