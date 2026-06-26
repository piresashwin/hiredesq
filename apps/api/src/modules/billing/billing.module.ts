import { Module } from "@nestjs/common";
import { CreditsModule } from "../credits/credits.module.js";
import { BillingController, StripeWebhookController } from "./billing.controller.js";
import { BillingService } from "./billing.service.js";

// Stripe billing (F8). CreditsModule provides the plan→allotment flip; PrismaService
// + guards come from the @Global() CommonModule.
@Module({
  imports: [CreditsModule],
  controllers: [BillingController, StripeWebhookController],
  providers: [BillingService],
})
export class BillingModule {}
