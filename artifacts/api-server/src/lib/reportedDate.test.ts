import { test } from "node:test";
import assert from "node:assert/strict";
import { validateReportedDate } from "./reportedDate.ts";

const TODAY = "2026-09-19";
test("valid same-day report", () => assert.deepEqual(validateReportedDate("2026-09-19", "2026-09-19", TODAY), { ok: true }));
test("report after incident is fine", () => assert.deepEqual(validateReportedDate("2026-09-19", "2026-09-10", TODAY), { ok: true }));
test("off-format rejected", () => assert.equal(validateReportedDate("09/19/2026", "2026-09-10", TODAY).ok, false));
test("future report rejected", () => assert.equal(validateReportedDate("2026-09-20", "2026-09-10", TODAY).ok, false));
test("report before incident rejected", () => assert.equal(validateReportedDate("2026-09-05", "2026-09-10", TODAY).ok, false));
