import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedStatusTransition } from "./incidentWorkflow.ts";

test("open -> settled allowed", () => assert.equal(isAllowedStatusTransition("open", "settled"), true));
test("under_investigation -> settled allowed", () => assert.equal(isAllowedStatusTransition("under_investigation", "settled"), true));
test("settled -> under_investigation allowed (reopen)", () => assert.equal(isAllowedStatusTransition("settled", "under_investigation"), true));
test("settled -> closed allowed", () => assert.equal(isAllowedStatusTransition("settled", "closed"), true));
test("settled -> archived NOT allowed (must pass through closed)", () => assert.equal(isAllowedStatusTransition("settled", "archived"), false));
test("settled -> settled allowed (no-op)", () => assert.equal(isAllowedStatusTransition("settled", "settled"), true));
