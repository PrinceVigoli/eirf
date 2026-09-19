/**
 * Minimal in-memory rate limiter.
 *
 * Deliberately dependency-free. Process-local, so it resets on
 * deploy/restart and doesn't share state across instances if this service
 * is ever horizontally scaled — fine for the current single-instance
 * deployment, but swap for a shared store (e.g. Redis) if that changes.
 */

import type { NextFunction, Request, Response } from "express";

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

export function isRateLimited(
  key: string,
  { windowMs, max }: { windowMs: number; max: number },
): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart > windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return false;
  }

  bucket.count += 1;
  return bucket.count > max;
}

// Express middleware wrapper around isRateLimited, keyed per-IP. Originally
// only /auth/login was limited; every other endpoint — including the
// unauthenticated /storage/public-objects/* path and the fairly expensive
// GET /incidents search — had no throttling at all.
export function rateLimitMiddleware({
  windowMs,
  max,
  keyPrefix,
}: {
  windowMs: number;
  max: number;
  keyPrefix: string;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (isRateLimited(`${keyPrefix}:${req.ip}`, { windowMs, max })) {
      res.status(429).json({ error: "Too many requests. Try again later." });
      return;
    }
    next();
  };
}

// Periodically clear stale buckets so this Map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > 30 * 60 * 1000) buckets.delete(key);
  }
}, 10 * 60 * 1000).unref();
