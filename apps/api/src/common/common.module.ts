import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";
import { AuthGuard, TenantGuard, PermissionsGuard } from "./guards.js";
import { StorageService, storageProvider } from "./storage.service.js";

// Global so every feature module gets PrismaService + the guard stack + the
// shared Storage client without re-declaring providers. The guards need DI
// (Prisma, Reflector), so they must be provided here rather than ad hoc.
@Global()
@Module({
  providers: [PrismaService, AuthGuard, TenantGuard, PermissionsGuard, storageProvider],
  exports: [PrismaService, AuthGuard, TenantGuard, PermissionsGuard, StorageService],
})
export class CommonModule {}
