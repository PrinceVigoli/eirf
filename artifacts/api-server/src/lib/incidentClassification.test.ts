import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveCategory } from "./incidentClassification.ts";

test("Crime maps to crime", () => {
  assert.equal(deriveCategory("Crime"), "crime");
});

test("non-crime types map to non_crime", () => {
  for (const t of ["Accident", "Dispute", "Missing Person", "Other"]) {
    assert.equal(deriveCategory(t), "non_crime");
  }
});

test("unknown type defaults to non_crime", () => {
  assert.equal(deriveCategory("Anything Else"), "non_crime");
});
