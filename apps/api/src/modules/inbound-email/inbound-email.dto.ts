import { Type } from "class-transformer";
import { IsArray, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";
import type { InboundAttachment, InboundEmailPayload } from "@hiredesq/shared";

// The normalized payload the email front (Cloudflare Email Worker) POSTs. The
// webhook is authenticated by a shared secret (the Worker holds it), not the user
// guard stack — see InboundEmailController.
class InboundAttachmentDto implements InboundAttachment {
  @IsString()
  @MaxLength(500)
  filename!: string;

  @IsString()
  @MaxLength(255)
  contentType!: string;

  // base64 bytes — capped generously (the Worker enforces real size limits upstream).
  @IsString()
  @MaxLength(40_000_000)
  contentBase64!: string;
}

export class InboundEmailDto implements InboundEmailPayload {
  @IsString()
  @MaxLength(320)
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  from?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000_000)
  text?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InboundAttachmentDto)
  attachments?: InboundAttachmentDto[];
}
