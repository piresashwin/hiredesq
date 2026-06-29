import { Controller, Get, UseGuards } from "@nestjs/common";
import type { PlanDto } from "@hiredesq/shared";
import { AuthGuard } from "../../common/guards.js";
import { PlansService } from "./plans.service.js";

// Plans are global reference/config data — NOT tenant-scoped (§1 intentional
// exception: pricing config is public reference data, not tenant data). This
// endpoint intentionally carries ONLY AuthGuard — TenantGuard / PermissionsGuard
// require a workspaceId in the route, which this endpoint does not have. Any
// authenticated user may fetch the pricing table.
@Controller("plans")
@UseGuards(AuthGuard)
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  list(): Promise<PlanDto[]> {
    return this.plans.listPlans();
  }
}
