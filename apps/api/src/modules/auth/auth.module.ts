import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { MailService } from "../../common/mail.service.js";

// PrismaService + guards + Storage come from the @Global() CommonModule. The
// MailService (a Nest seam over the @hiredesq/core mail adapter) is auth-local.
@Module({
  controllers: [AuthController],
  providers: [AuthService, MailService],
})
export class AuthModule {}
