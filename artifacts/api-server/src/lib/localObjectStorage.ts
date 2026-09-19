import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  canAccessObject,
  getObjectAclPolicy,
  ObjectAclPolicy,
  ObjectPermission,
  setObjectAclPolicy,
} from './objectAcl';
import { ObjectNotFoundError, type StorageFile } from './objectStorageTypes';

// Dev-only stand-in for GCS. Stores raw file bytes on disk plus a small
// JSON sidecar per file for metadata (content type, size, ACL policy) —
// mirroring the shape of GCS object metadata closely enough that
// objectAcl.ts's logic runs unmodified against it.
const STORAGE_ROOT = path.resolve(
  process.env.LOCAL_OBJECT_STORAGE_DIR || path.join(process.cwd(), 'local-object-storage'),
);
const PRIVATE_DIR = path.join(STORAGE_ROOT, 'private');
const PUBLIC_DIR = path.join(STORAGE_ROOT, 'public');

interface LocalMetadata {
  name: string;
  contentType?: string;
  size?: number;
  metadata?: Record<string, string>;
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function metaPathFor(filePath: string): string {
  return `${filePath}.meta.json`;
}

function readMeta(filePath: string): LocalMetadata | null {
  const metaPath = metaPathFor(filePath);
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as LocalMetadata;
  } catch {
    return null;
  }
}

function writeMeta(filePath: string, meta: LocalMetadata) {
  fs.writeFileSync(metaPathFor(filePath), JSON.stringify(meta));
}

/** A single stored object on local disk, structurally compatible with StorageFile. */
class LocalFile implements StorageFile {
  constructor(
    private readonly absPath: string,
    public readonly name: string,
  ) {}

  async exists(): Promise<[boolean]> {
    return [fs.existsSync(this.absPath)];
  }

  async getMetadata(): Promise<[Record<string, unknown>]> {
    const meta = readMeta(this.absPath) ?? { name: this.name };
    return [
      {
        name: meta.name,
        contentType: meta.contentType,
        size: meta.size,
        metadata: meta.metadata ?? {},
      },
    ];
  }

  async setMetadata(options: { metadata: Record<string, string> }): Promise<void> {
    const meta = readMeta(this.absPath) ?? { name: this.name };
    meta.metadata = { ...(meta.metadata ?? {}), ...options.metadata };
    writeMeta(this.absPath, meta);
  }

  createReadStream(): NodeJS.ReadableStream {
    return fs.createReadStream(this.absPath);
  }
}

export class LocalObjectStorageService {
  constructor() {
    ensureDir(PRIVATE_DIR);
    ensureDir(PUBLIC_DIR);
  }

  /** Absolute path for a given object id under private/uploads/. Exposed for the upload route. */
  static absolutePathForUpload(objectId: string): string {
    ensureDir(path.join(PRIVATE_DIR, 'uploads'));
    return path.join(PRIVATE_DIR, 'uploads', objectId);
  }

  /** Write metadata for a freshly-uploaded object. Called by the upload route once the file lands on disk. */
  static writeUploadMetadata(
    objectId: string,
    meta: { contentType?: string; size?: number },
  ) {
    const absPath = LocalObjectStorageService.absolutePathForUpload(objectId);
    writeMeta(absPath, {
      name: objectId,
      contentType: meta.contentType,
      size: meta.size,
      // Uploaded objects start out private, owner-less — the app sets the
      // real ACL policy right after registering the evidence record, the
      // same way it does for the GCS backend.
      metadata: {},
    });
  }

  async searchPublicObject(filePath: string): Promise<LocalFile | null> {
    const fullPath = path.join(PUBLIC_DIR, filePath);
    if (!fullPath.startsWith(PUBLIC_DIR)) return null; // guard against path traversal
    if (!fs.existsSync(fullPath)) return null;
    return new LocalFile(fullPath, path.basename(filePath));
  }

  async downloadObject(file: LocalFile, cacheTtlSec: number = 3600): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const aclPolicy = await getObjectAclPolicy(file);
    const isPublic = aclPolicy?.visibility === 'public';

    const nodeStream = file.createReadStream();
    const webStream = nodeStreamToWeb(nodeStream);

    const headers: Record<string, string> = {
      'Content-Type': (metadata.contentType as string) || 'application/octet-stream',
      'Cache-Control': `${isPublic ? 'public' : 'private'}, max-age=${cacheTtlSec}`,
      'Content-Disposition': `attachment; filename="${sanitizeFilename(String(metadata.name ?? 'file'))}"`,
      'X-Content-Type-Options': 'nosniff',
    };
    if (metadata.size) {
      headers['Content-Length'] = String(metadata.size);
    }

    return new Response(webStream, { headers });
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const objectId = randomUUID();
    // A relative URL: the frontend's dev server proxies /api/* straight to
    // this backend (see vite.config.ts), so this works the same way a
    // presigned GCS URL would from the browser's point of view — a URL you
    // can PUT bytes to, no extra auth handshake required.
    return `/api/storage/local-upload/${objectId}`;
  }

  async getObjectEntityFile(objectPath: string): Promise<LocalFile> {
    if (!objectPath.startsWith('/objects/')) {
      throw new ObjectNotFoundError();
    }
    const entityId = objectPath.slice('/objects/'.length);
    const absPath = path.join(PRIVATE_DIR, entityId);
    if (!absPath.startsWith(PRIVATE_DIR) || !fs.existsSync(absPath)) {
      throw new ObjectNotFoundError();
    }
    return new LocalFile(absPath, path.basename(absPath));
  }

  normalizeObjectEntityPath(rawPath: string): string {
    const prefix = '/api/storage/local-upload/';
    if (!rawPath.startsWith(prefix)) {
      return rawPath;
    }
    const objectId = rawPath.slice(prefix.length);
    return `/objects/uploads/${objectId}`;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy,
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith('/')) {
      return normalizedPath;
    }
    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: LocalFile;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/["\r\n\x00-\x1f]/g, '_') || 'file';
}

function nodeStreamToWeb(nodeStream: NodeJS.ReadableStream): ReadableStream {
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk) => controller.enqueue(chunk));
      nodeStream.on('end', () => controller.close());
      nodeStream.on('error', (err) => controller.error(err));
    },
    cancel() {
      (nodeStream as any).destroy?.();
    },
  });
}
