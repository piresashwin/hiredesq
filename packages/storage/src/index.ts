import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Object storage for uploaded resumes (CV-parse pipeline, CLAUDE.md §2/§5).
 * S3-compatible — Cloudflare R2 in prod, MinIO in local dev (same `S3_*` env).
 *
 * KEY NAMESPACING IS A TENANT BOUNDARY (§1): every key is built via
 * `workspaceKey(workspaceId, ...)`, and a signed URL must never resolve across
 * that boundary. Callers pass a workspaceId; this module refuses keys that don't
 * start with the workspace prefix.
 */

const WORKSPACES_ROOT = "workspaces";

/** Build a workspace-namespaced key. The ONLY supported way to address objects. */
export function workspaceKey(workspaceId: string, ...parts: string[]): string {
  if (!workspaceId) throw new Error("workspaceId required for storage key");
  return [WORKSPACES_ROOT, workspaceId, ...parts].join("/");
}

/** Guard: a key must belong to the given workspace (defence in depth for §1). */
function assertInWorkspace(workspaceId: string, key: string): void {
  const prefix = `${WORKSPACES_ROOT}/${workspaceId}/`;
  if (!key.startsWith(prefix)) {
    throw new Error("storage key is outside the workspace boundary");
  }
}

export interface StorageConfig {
  endpoint?: string;
  region?: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** R2/MinIO need path-style addressing. */
  forcePathStyle?: boolean;
}

export class Storage {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(config: StorageConfig) {
    this.bucket = config.bucket;
    this.s3 = new S3Client({
      endpoint: config.endpoint,
      region: config.region ?? "auto",
      forcePathStyle: config.forcePathStyle ?? true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  /** Build a Storage from the standard S3_* env (used by api + worker). */
  static fromEnv(): Storage {
    const bucket = process.env.S3_BUCKET;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new Error("S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY must be set");
    }
    return new Storage({
      endpoint: process.env.S3_ENDPOINT || undefined,
      region: process.env.S3_REGION || undefined,
      bucket,
      accessKeyId,
      secretAccessKey,
      forcePathStyle: true,
    });
  }

  async put(workspaceId: string, key: string, body: Buffer, contentType: string): Promise<void> {
    assertInWorkspace(workspaceId, key);
    await this.s3.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  /** Fetch raw bytes (worker uses this to extract text / send to vision). */
  async getBytes(workspaceId: string, key: string): Promise<Buffer> {
    assertInWorkspace(workspaceId, key);
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error("empty object body");
    return Buffer.from(bytes);
  }

  /** Short-TTL signed GET URL — never long-lived, never cross-tenant (§1/§2). */
  async signedGetUrl(workspaceId: string, key: string, expiresInSeconds = 300): Promise<string> {
    assertInWorkspace(workspaceId, key);
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  async delete(workspaceId: string, key: string): Promise<void> {
    assertInWorkspace(workspaceId, key);
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /** Delete several objects (e.g. all of a candidate's files on PII delete, §2). */
  async deleteMany(workspaceId: string, keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    for (const key of keys) assertInWorkspace(workspaceId, key);
    await this.s3.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })) },
      }),
    );
  }
}
