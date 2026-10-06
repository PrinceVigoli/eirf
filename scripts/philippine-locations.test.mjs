import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createLocationOptions } from "../artifacts/eirf/src/lib/philippine-locations.ts";

const data = JSON.parse(await readFile(new URL("../artifacts/eirf/public/data/philippine-locations.json", import.meta.url), "utf8"));
const options = createLocationOptions(data);

test("pinned snapshot has nationwide coverage and complete parent links", () => {
  assert.equal(data.regions.length, 18);
  assert.equal(data.barangays.length, 42010);
  for (const [rows, parents] of [[data.provinces, data.regions], [data.cities, data.provinces], [data.barangays, data.cities]]) {
    const codes = new Set(parents.map(row => row[0]));
    assert.equal(new Set(rows.map(row => row[0])).size, rows.length);
    for (const row of rows) assert.ok(codes.has(row[2]), `Missing parent: ${row[0]}`);
  }
});

test("region, province, city and barangay cascade without crossing parents", () => {
  const values = { region: "Region I (Ilocos Region)", province: "Ilocos Norte", cityMunicipality: "Adams" };
  assert.ok(options("province", values).includes("Ilocos Norte"));
  assert.ok(!options("province", values).includes("Cebu"));
  assert.ok(options("cityMunicipality", values).includes("Adams"));
  assert.deepEqual(options("barangay", values), ["Adams"]);
  assert.deepEqual(options("cityMunicipality", { ...values, province: "Cebu" }), []);
  assert.deepEqual(options("barangay", { ...values, cityMunicipality: "City of Manila" }), []);
  assert.deepEqual(options("province", {}), []);
});

test("NCR supports Manila and all 897 barangays without selecting a district", () => {
  const region = "National Capital Region (NCR)";
  const values = { region, province: region, cityMunicipality: "City of Manila" };
  assert.ok(options("province", values).includes(region));
  assert.ok(options("cityMunicipality", values).includes("City of Manila"));
  assert.ok(!options("cityMunicipality", values).includes("Ermita"));
  assert.equal(options("barangay", values).length, 897);
});

test("every barangay is reachable through the four dropdown levels", () => {
  let reachable = 0;
  for (const region of options("region", {})) {
    for (const province of options("province", { region })) {
      for (const cityMunicipality of options("cityMunicipality", { region, province })) {
        reachable += options("barangay", { region, province, cityMunicipality }).length;
      }
    }
  }
  assert.equal(reachable, data.barangays.length);
});
