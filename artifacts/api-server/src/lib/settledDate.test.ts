import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSettledDate } from "./settledDate.ts";

const TODAY = "2026-09-19";
test("settled with no supplied date -> today", () => assert.equal(resolveSettledDate("settled", undefined, TODAY), TODAY));
test("settled with valid supplied date -> supplied", () => assert.equal(resolveSettledDate("settled", "2026-09-10", TODAY), "2026-09-10"));
test("settled with invalid supplied date -> today", () => assert.equal(resolveSettledDate("settled", "09/10/2026", TODAY), TODAY));
test("closed -> null (cleared)", () => assert.equal(resolveSettledDate("closed", "2026-09-10", TODAY), null));
test("under_investigation -> null", () => assert.equal(resolveSettledDate("under_investigation", null, TODAY), null));
