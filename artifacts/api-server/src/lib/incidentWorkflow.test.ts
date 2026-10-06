import test from "node:test";
import assert from "node:assert/strict";
import { CASE_STATUSES, isAllowedStatusTransition } from "./incidentWorkflow.ts";

for (const current of CASE_STATUSES) {
  for (const next of CASE_STATUSES) {
    test(current + " -> " + next + " supports classification and corrections", () => {
      assert.equal(isAllowedStatusTransition(current, next), true);
    });
  }
}
for (const legacy of ["open", "settled", "closed", "archived"]) {
  test(legacy + " remains readable and can be reviewed into a new classification", () => {
    assert.equal(isAllowedStatusTransition(legacy, legacy), true);
    for (const next of CASE_STATUSES) assert.equal(isAllowedStatusTransition(legacy, next), true);
    for (const current of CASE_STATUSES) assert.equal(isAllowedStatusTransition(current, legacy), false);
  });
}
test("unknown status cannot transition", () => assert.equal(isAllowedStatusTransition("unknown", "solved"), false));
