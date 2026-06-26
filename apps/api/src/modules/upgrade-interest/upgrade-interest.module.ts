import { Module } from "@nestjs/common";
import { UpgradeInterestController } from "./upgrade-interest.controller.js";
import { UpgradeInterestService } from "./upgrade-interest.service.js";

// PrismaService + guards come from the @Global() CommonModule.
@Module({
  controllers: [UpgradeInterestController],
  providers: [UpgradeInterestService],
})
export class UpgradeInterestModule {}
