import { Module } from "@nestjs/common";
import { StatsController } from "./stats.controller.js";
import { StatsService } from "./stats.service.js";

// PrismaService + guards come from the @Global() CommonModule. The home overview
// reuses the revenue module's pure `recognition()` helper directly (a file import,
// not a provider) so the cleared number reconciles with the revenue dashboard.
@Module({
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
