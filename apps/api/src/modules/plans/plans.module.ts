import { Module } from "@nestjs/common";
import { PlansController } from "./plans.controller.js";
import { PlansService } from "./plans.service.js";

// PrismaService + guards come from the @Global() CommonModule.
@Module({
  controllers: [PlansController],
  providers: [PlansService],
})
export class PlansModule {}
