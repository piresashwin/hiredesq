import { BadRequestException } from "@nestjs/common";
import type { CustomFieldType } from "@hiredesq/shared";

// The bits of a definition needed to validate a value. Shared by the candidate
// update path (which stores values) so validation lives in one place.
export interface FieldShape {
  id: string;
  label: string;
  type: CustomFieldType;
  options: string[];
}

/**
 * Validate + normalize a raw custom-field value against its definition, returning
 * the canonical string we persist (booleans as "true"/"false", dates as
 * yyyy-mm-dd, numbers as their text). Throws BadRequestException on a bad value so
 * the stored data stays clean (CLAUDE.md — clean, trustworthy candidate data).
 */
export function coerceCustomFieldValue(def: FieldShape, raw: string): string {
  const v = raw.trim();
  switch (def.type) {
    case "text":
      return v;
    case "number":
      if (!/^-?\d+(\.\d+)?$/.test(v)) {
        throw new BadRequestException(`"${def.label}" must be a number`);
      }
      return v;
    case "date":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
        throw new BadRequestException(`"${def.label}" must be a date (YYYY-MM-DD)`);
      }
      return v;
    case "boolean":
      if (v !== "true" && v !== "false") {
        throw new BadRequestException(`"${def.label}" must be true or false`);
      }
      return v;
    case "select":
      if (!def.options.includes(v)) {
        throw new BadRequestException(`"${v}" is not a valid option for "${def.label}"`);
      }
      return v;
    default:
      return v;
  }
}
