import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "./prisma.service.js";
import { verifyToken } from "./jwt.js";

// The guard stack (CLAUDE.md §1). Every workspace-scoped controller carries
// AuthGuard + TenantGuard + PermissionsGuard. Isolation is app-layer only in v1
// (RLS deferred), so TenantGuard is the real boundary — no backstop behind it.

// Request shape the guards read/augment. Structural type (no fastify import) —
// covers the headers/params we touch plus the principal set by the guards.
export interface AuthedRequest {
  headers: Record<string, string | string[] | undefined>;
  params?: Record<string, string>;
  user?: { id: string };
  membership?: { role: "owner" | "member" };
}

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers["authorization"];
    if (!header || Array.isArray(header) || !header.startsWith("Bearer ")) {
      throw new UnauthorizedException("missing bearer token");
    }
    const token = header.slice("Bearer ".length).trim();
    try {
      const payload = verifyToken(token);
      req.user = { id: payload.sub };
    } catch {
      throw new UnauthorizedException("invalid token");
    }
    return true;
  }
}

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException("unauthenticated");

    // workspaceId comes from the route param, never the body (§1).
    const workspaceId = req.params?.workspaceId;
    if (!workspaceId) throw new ForbiddenException("no workspace in scope");

    const membership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });
    if (!membership) throw new ForbiddenException("not a member of this workspace");

    req.membership = { role: membership.role };
    return true;
  }
}

export const RequirePermission = (action: string, resource: string) =>
  SetMetadata("permission", { action, resource });

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const meta = this.reflector.getAllAndOverride<{ action: string; resource: string }>("permission", [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    // No permission metadata → nothing extra to enforce (TenantGuard already
    // confirmed membership).
    if (!meta) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const role = req.membership?.role;
    if (!role) throw new ForbiddenException("no membership in scope");

    // Owners can do anything. Members are read/write only — destructive actions
    // and billing/workspace administration are owner-only.
    const ownerOnly = meta.action === "delete" || meta.resource === "billing" || meta.resource === "workspace";
    if (ownerOnly && role !== "owner") {
      throw new ForbiddenException("requires owner role");
    }
    return true;
  }
}
