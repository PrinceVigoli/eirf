import fs from 'fs';
import { Readable } from 'stream';
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from '@workspace/api-zod';
import { Router, type IRouter, type Request, type Response } from 'express';

import { requireAuth } from '../middlewares/requireAuth';
import { rateLimitMiddleware } from '../lib/rateLimit';
import { paramString } from '../lib/params';
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from '../lib/objectStorage';
import { LocalObjectStorageService } from '../lib/localObjectStorage';

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const MAX_LOCAL_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB — dev-only guard rail

/**
 * PUT /storage/local-upload/:objectId
 *
 * Counterpart to the local-disk ObjectStorageService backend's
 * getObjectEntityUploadURL(): when running without GCS configured, that
 * method hands the frontend this URL instead of a real presigned GCS URL,
 * and the frontend PUTs the raw file bytes here exactly the way it would
 * PUT them to GCS. Only reachable when the local backend is actually
 * generating these URLs (see OBJECT_STORAGE_BACKEND in objectStorage.ts);
 * a valid, unguessable objectId is the only "credential" here, matching
 * how a presigned URL behaves.
 */
router.put(
  '/storage/local-upload/:objectId',
  rateLimitMiddleware({ windowMs: 60 * 1000, max: 60, keyPrefix: 'local-upload' }),
  (req: Request, res: Response) => {
    const objectId = paramString(req.params.objectId);
    if (!objectId || !/^[a-f0-9-]{10,60}$/i.test(objectId)) {
      res.status(400).json({ error: 'Invalid objectId' });
      return;
    }

    const absPath = LocalObjectStorageService.absolutePathForUpload(objectId);
    const writeStream = fs.createWriteStream(absPath);
    let bytesWritten = 0;
    let aborted = false;

    req.on('data', (chunk: Buffer) => {
      bytesWritten += chunk.length;
      if (bytesWritten > MAX_LOCAL_UPLOAD_BYTES && !aborted) {
        aborted = true;
        writeStream.destroy();
        fs.unlink(absPath, () => {});
        res.status(413).json({ error: 'File too large' });
        req.destroy();
      }
    });

    req.on('error', (err) => {
      req.log.error({ err }, 'Error receiving local upload');
      writeStream.destroy();
    });

    writeStream.on('error', (err) => {
      req.log.error({ err }, 'Error writing local upload to disk');
      if (!res.headersSent) res.status(500).json({ error: 'Failed to store file' });
    });

    writeStream.on('finish', () => {
      if (aborted) return;
      LocalObjectStorageService.writeUploadMetadata(objectId, {
        contentType: paramString(req.headers['content-type']) || 'application/octet-stream',
        size: bytesWritten,
      });
      res.status(200).json({ ok: true });
    });

    req.pipe(writeStream);
  },
);

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * Protected by cookie-based requireAuth middleware.
 */
router.post(
  '/storage/uploads/request-url',
  requireAuth,
  async (req: Request, res: Response) => {
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing or invalid required fields' });
      return;
    }

    try {
      const { name, size, contentType } = parsed.data;

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath =
        objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, 'Error generating upload URL');
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get(
  '/storage/public-objects/*filePath',
  // This is the one route in the app with no auth at all, so it gets its
  // own tighter limit independent of the global one in app.ts.
  rateLimitMiddleware({ windowMs: 60 * 1000, max: 120, keyPrefix: 'public-objects' }),
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join('/') : raw;
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const response = await objectStorageService.downloadObject(file);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      req.log.error({ err: error }, 'Error serving public object');
      res.status(500).json({ error: 'Failed to serve public object' });
    }
  },
);

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These hold case evidence (incident attachments), so every request must be
 * authenticated the same way the rest of the API is — via the signed
 * officerId cookie. There is no per-incident ACL model in this app (any
 * signed-in officer can already view any incident through the API), so
 * requireAuth is the correct bar here: it closes the "public if you know
 * the path" hole without inventing a permissions model the rest of the
 * app doesn't have.
 */
router.get(
  '/storage/objects/*path',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.path;
      const wildcardPath = Array.isArray(raw) ? raw.join('/') : raw;
      const objectPath = `/objects/${wildcardPath}`;
      const objectFile =
        await objectStorageService.getObjectEntityFile(objectPath);

      const response = await objectStorageService.downloadObject(objectFile);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        req.log.warn({ err: error }, 'Object not found');
        res.status(404).json({ error: 'Object not found' });
        return;
      }
      req.log.error({ err: error }, 'Error serving object');
      res.status(500).json({ error: 'Failed to serve object' });
    }
  },
);

export default router;
