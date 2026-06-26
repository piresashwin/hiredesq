import { Module } from "@nestjs/common";
import { ParseJobsController } from "./parse-jobs.controller.js";
import { ParseJobsService } from "./parse-jobs.service.js";

// PrismaService + guards come from the @Global() CommonModule.
@Module({
  controllers: [ParseJobsController],
  providers: [ParseJobsService],
})
export class ParseJobsModule {}
