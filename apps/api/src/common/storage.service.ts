import { Storage } from "@hiredesq/storage";

// Injection token for the singleton object-storage client. Modules inject
// `StorageService` rather than constructing S3 clients ad hoc — one client,
// built once from the S3_* env via the factory provider below. Key namespacing
// (workspaceKey) is the tenant boundary (§1); Storage refuses cross-workspace
// keys, and signed URLs are short-lived and never cross that boundary (§2).
export const StorageService = Symbol("StorageService");

// The injected type is the Storage class itself.
export type StorageService = Storage;

// Factory provider — one `Storage.fromEnv()` for the whole app.
export const storageProvider = {
  provide: StorageService,
  useFactory: (): Storage => Storage.fromEnv(),
};
