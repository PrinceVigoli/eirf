import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSettledDate, isValidIsoDate } from "./settledDate.ts";

const TODAY = "2026-09-19";
test("settled with no supplied date -> today", () => assert.equal(resolveSettledDate("settled", undefined, TODAY), TODAY));
test("settled with valid supplied date -> supplied", () => assert.equal(resolveSettledDate("settled", "2026-09-10", TODAY), "2026-09-10"));
test("settled with invalid supplied date -> today", () => assert.equal(resolveSettledDate("settled", "09/10/2026", TODAY), TODAY));
test("settled with calendar-invalid ISO-shaped date -> today", () => assert.equal(resolveSettledDate("settled", "2026-02-30", TODAY), TODAY));
test("closed -> null (cleared)", () => assert.equal(resolveSettledDate("closed", "2026-09-10", TODAY), null));
test("under_investigation -> null", () => assert.equal(resolveSettledDate("under_investigation", null, TODAY), null));

test("isValidIsoDate accepts a real calendar date", () => {
  assert.equal(isValidIsoDate("2026-09-19"), true);
});

test("isValidIsoDate rejects ISO-shaped but calendar-invalid dates (round-trip check)", () => {
  assert.equal(isValidIsoDate("2026-02-30"), false); // Feb 30 does not exist
  assert.equal(isValidIsoDate("2026-13-01"), false); // month 13 does not exist
  assert.equal(isValidIsoDate("2026-04-31"), false); // April has 30 days
});

test("isValidIsoDate rejects non-ISO-shaped strings", () => {
  assert.equal(isValidIsoDate("09/10/2026"), false);
});
