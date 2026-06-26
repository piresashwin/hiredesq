import { Injectable, type OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@hiredesq/database";

// App Prisma client. v1 enforces tenancy in the app layer — every query must
// filter by workspaceId (CLAUDE.md §1). When RLS is later enabled, the
// request-scoped client sets the workspace session variable here.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
