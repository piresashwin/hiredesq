import { Module } from "@nestjs/common";
import { PlacementsController } from "./placements.controller.js";
import { PlacementsService } from "./placements.service.js";

// PrismaService + guards come from the @Global() CommonModule.
@Module({
  controllers: [PlacementsController],
  providers: [PlacementsService],
})
export class PlacementsModule {}
