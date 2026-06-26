import { Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller.js";
import { NotificationsService } from "./notifications.service.js";

// PrismaService + guards come from the @Global() CommonModule. Exports the service
// so any other feature module can inject it to emit notifications (the systematic
// entry point — CLAUDE.md Architecture: pragmatic CRUD, no event bus).
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
