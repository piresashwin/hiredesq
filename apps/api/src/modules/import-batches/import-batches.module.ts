import { Module } from "@nestjs/common";
import { ImportBatchesController } from "./import-batches.controller.js";
import { ImportBatchesService } from "./import-batches.service.js";

// PrismaService + guards come from the @Global() CommonModule.
@Module({
  controllers: [ImportBatchesController],
  providers: [ImportBatchesService],
})
export class ImportBatchesModule {}
