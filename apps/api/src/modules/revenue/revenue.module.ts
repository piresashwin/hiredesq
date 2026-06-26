import { Module } from "@nestjs/common";
import { RevenueController } from "./revenue.controller.js";
import { RevenueService } from "./revenue.service.js";

// PrismaService + guards come from the @Global() CommonModule.
@Module({
  controllers: [RevenueController],
  providers: [RevenueService],
})
export class RevenueModule {}
