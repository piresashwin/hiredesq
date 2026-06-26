import { Module } from "@nestjs/common";
import { CommonModule } from "./common/common.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { CandidatesModule } from "./modules/candidates/candidates.module.js";
import { IngestModule } from "./modules/ingest/ingest.module.js";
import { ParseJobsModule } from "./modules/parse-jobs/parse-jobs.module.js";
import { CreditsModule } from "./modules/credits/credits.module.js";
import { UploadsModule } from "./modules/uploads/uploads.module.js";
import { ImportBatchesModule } from "./modules/import-batches/import-batches.module.js";
import { DuplicatesModule } from "./modules/duplicates/duplicates.module.js";
import { JobsModule } from "./modules/jobs/jobs.module.js";
import { ApplicationsModule } from "./modules/applications/applications.module.js";
import { QualificationTrailModule } from "./modules/qualification-trail/qualification-trail.module.js";
import { PlacementsModule } from "./modules/placements/placements.module.js";
import { RevenueModule } from "./modules/revenue/revenue.module.js";
import { SubmissionsModule } from "./modules/submissions/submissions.module.js";
import { InboundEmailModule } from "./modules/inbound-email/inbound-email.module.js";
import { BillingModule } from "./modules/billing/billing.module.js";
import { UpgradeInterestModule } from "./modules/upgrade-interest/upgrade-interest.module.js";
import { StatsModule } from "./modules/stats/stats.module.js";

// CommonModule is @Global() — provides PrismaService + the guard stack to every
// feature module. Each workspace-scoped module follows the /nestjs-module skill.
@Module({
  imports: [
    CommonModule,
    AuthModule,
    CandidatesModule,
    IngestModule,
    ParseJobsModule,
    CreditsModule,
    UploadsModule,
    ImportBatchesModule,
    DuplicatesModule,
    JobsModule,
    ApplicationsModule,
    QualificationTrailModule,
    PlacementsModule,
    RevenueModule,
    SubmissionsModule,
    InboundEmailModule,
    BillingModule,
    UpgradeInterestModule,
    StatsModule,
  ],
})
export class AppModule {}
