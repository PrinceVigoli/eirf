import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { calculateLogHash } from "./auditHash.ts";
import { hashReadable } from "./evidenceHash.ts";
import { isAllowedStatusTransition } from "./incidentWorkflow.ts";

test("audit hashes are deterministic and tamper-sensitive", () => {
  const at = new Date("2026-01-01T00:00:00.000Z");
  const hash = calculateLogHash(null, at, 1, "LOGIN", "Officer signed in");
  assert.equal(hash.length, 64);
  assert.equal(hash, calculateLogHash(null, at, 1, "LOGIN", "Officer signed in"));
  assert.notEqual(hash, calculateLogHash(null, at, 1, "LOGIN", "Changed detail"));
  assert.notEqual(hash, calculateLogHash("previous", at, 1, "LOGIN", "Officer signed in"));
});

test("evidence hashing matches the known SHA-256 digest", async () => {
  const digest = await hashReadable(Readable.from([Buffer.from("e-IRF evidence") ]));
  assert.equal(digest, "77175279593ba6c8f8fd386a206d407068106bf537b7c65a0248a77780c497e2");
});

test("incident workflow blocks reopening archived records directly", () => {
  assert.equal(isAllowedStatusTransition("open", "under_investigation"), true);
  assert.equal(isAllowedStatusTransition("closed", "archived"), true);
  assert.equal(isAllowedStatusTransition("archived", "open"), false);
  assert.equal(isAllowedStatusTransition("unknown", "open"), false);
});
