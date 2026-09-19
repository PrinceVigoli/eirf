export class ObjectNotFoundError extends Error {
  constructor() {
    super('Object not found');
    this.name = 'ObjectNotFoundError';
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

/**
 * The minimal surface of a GCS `File` that objectAcl.ts actually uses.
 * Kept structural (rather than importing the concrete `File` class from
 * `@google-cloud/storage`) so the same ACL logic can run against either the
 * real GCS backend or the local-disk dev backend. Metadata return types are
 * intentionally loose (`Promise<any>`) so both a GCS `[Metadata, Response]`
 * tuple and a local backend's `[LocalMetadata]` tuple satisfy it.
 */
export interface AclCapableFile {
  name: string;
  exists(): Promise<[boolean]>;
  getMetadata(): Promise<any>;
  setMetadata(options: { metadata: Record<string, string> }): Promise<any>;
}

/** Everything ObjectStorageService needs from a file handle, either backend. */
export interface StorageFile extends AclCapableFile {
  createReadStream(): NodeJS.ReadableStream;
}
