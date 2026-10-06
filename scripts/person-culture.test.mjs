import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cultureOptions } from "../artifacts/eirf/src/lib/person-culture.ts";

const data = JSON.parse(await readFile(new URL("../artifacts/eirf/src/data/philippine-culture.json", import.meta.url), "utf8"));

test("PSA snapshot contains every code from 001 to 182", () => {
  assert.equal(data.entries.length, 182);
  assert.deepEqual(data.entries.map(entry => entry.code), Array.from({ length: 182 }, (_, i) => String(i + 1).padStart(3, "0")));
  assert.equal(data.entries.find(entry => entry.code === "086").name, "Isneg/Isnag/Apayao");
});

test("dialect and tribe retain separate values and aliases", () => {
  const dialects = cultureOptions(data.entries, "dialect");
  const tribes = cultureOptions(data.entries, "tribe");
  assert.equal(dialects.find(option => option.value === "Isnag").label, "Isnag (Isneg / Apayao)");
  assert.equal(tribes.find(option => option.value === "Isneg").label, "Isneg (Isnag / Apayao)");
  assert.ok(dialects.some(option => option.value === "English"));
  assert.ok(!tribes.some(option => option.value === "English"));
  assert.ok(tribes.some(option => option.value === "American"));
  for (const list of [dialects, tribes]) {
    assert.equal(list.length, 182);
    assert.equal(new Set(list.map(option => option.value)).size, list.length);
    assert.ok(list.every(option => option.value));
  }
});

test("editing keeps existing free-text records selectable without replacing them", () => {
  const options = cultureOptions(data.entries, "dialect", "Previously recorded dialect");
  assert.ok(options.some(option => option.value === "Previously recorded dialect"));
  assert.equal(cultureOptions(data.entries, "dialect", "Isnag").length, 182);
});
