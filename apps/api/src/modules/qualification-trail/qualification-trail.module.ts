import { Module } from "@nestjs/common";
import { QualificationTrailController } from "./qualification-trail.controller.js";
import { QualificationTrailService } from "./qualification-trail.service.js";

// PrismaService + guards come from the @Global() CommonModule.
@Module({
  controllers: [QualificationTrailController],
  providers: [QualificationTrailService],
})
export class QualificationTrailModule {}
