import { ObjectAclPolicy, ObjectPermission } from './objectAcl';
import { GcsObjectStorageService } from './gcsObjectStorage';
import { LocalObjectStorageService } from './localObjectStorage';
import { ObjectNotFoundError, type StorageFile } from './objectStorageTypes';

export { ObjectNotFoundError };

// Local dev shouldn't require a GCP project just to click around the app.
// - OBJECT_STORAGE_BACKEND=gcs   -> always use real Google Cloud Storage
// - OBJECT_STORAGE_BACKEND=local -> always use the local-disk dev backend
// - unset                        -> use GCS if it looks configured
//                                    (PRIVATE_OBJECT_DIR is set, as it would
//                                    be on Replit/production), else fall
//                                    back to local disk automatically.
function useGcsBackend(): boolean {
  const explicit = process.env.OBJECT_STORAGE_BACKEND;
  if (explicit === 'gcs') return true;
  if (explicit === 'local') return false;
  return Boolean(process.env.PRIVATE_OBJECT_DIR);
}

/**
 * Thin delegating facade — routes just do `new ObjectStorageService()` and
 * call these methods without caring which backend is behind them.
 */
export class ObjectStorageService {
  private readonly impl: GcsObjectStorageService | LocalObjectStorageService;

  constructor() {
    this.impl = useGcsBackend() ? new GcsObjectStorageService() : new LocalObjectStorageService();
  }

  async searchPublicObject(filePath: string): Promise<StorageFile | null> {
    return this.impl.searchPublicObject(filePath) as Promise<StorageFile | null>;
  }

  async downloadObject(file: StorageFile, cacheTtlSec: number = 3600): Promise<Response> {
    return this.impl.downloadObject(file as any, cacheTtlSec);
  }

  async getObjectEntityUploadURL(): Promise<string> {
    return this.impl.getObjectEntityUploadURL();
  }

  async getObjectEntityFile(objectPath: string): Promise<StorageFile> {
    return this.impl.getObjectEntityFile(objectPath) as Promise<StorageFile>;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    return this.impl.normalizeObjectEntityPath(rawPath);
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy,
  ): Promise<string> {
    return this.impl.trySetObjectEntityAclPolicy(rawPath, aclPolicy);
  }

  async canAccessObjectEntity(args: {
    userId?: string;
    objectFile: StorageFile;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return this.impl.canAccessObjectEntity(args as any);
  }
}
