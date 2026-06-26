import { Module } from "@nestjs/common";
import { CustomFieldsController } from "./custom-fields.controller.js";
import { CustomFieldsService } from "./custom-fields.service.js";

// PrismaService + guards come from the @Global() CommonModule.
@Module({
  controllers: [CustomFieldsController],
  providers: [CustomFieldsService],
})
export class CustomFieldsModule {}
