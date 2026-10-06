import { mkdir, writeFile } from "node:fs/promises";

// Pin the source so rebuilding does not silently change saved location names.
const commit = "e360c9da26ae9455f357ab7d048389a1a8f05c2a";
const source = `https://raw.githubusercontent.com/fish-and-bear/psgc/${commit}`;
const output = new URL("../artifacts/eirf/public/data/", import.meta.url);
async function download(path) {
  const response = await fetch(`${source}/${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.text();
}
const [regions, provinces, cities, barangays, license] = await Promise.all([
  ...["regions", "provinces", "cities", "barangays"].map(async name => JSON.parse(await download(`psgc/data/core/${name}.json`))),
  download("LICENSE"),
]);
// Manila's sub-municipalities are districts, not separate cities. Attach their
// barangays to Manila to keep the requested four-level dropdown hierarchy.
const districtParents = new Map(cities.filter(row => row.geographic_level === "SubMun")
  .map(row => [row.psgc_code, `${row.psgc_code.slice(0, 5)}00000`]));
const data = {
  source: "https://github.com/fish-and-bear/psgc", commit, release: "PSA PSGC Q1 2026",
  regions: regions.map(row => [row.psgc_code, row.name]),
  provinces: provinces.map(row => [row.psgc_code, row.name, row.region_code]),
  cities: cities.filter(row => !districtParents.has(row.psgc_code)).map(row => [row.psgc_code, row.name, row.province_code, row.region_code]),
  barangays: barangays.map(row => [row.psgc_code, row.name, districtParents.get(row.city_code) ?? row.city_code]),
};
for (const [rows, parents, parentIndex] of [[data.provinces, data.regions, 2], [data.cities, data.provinces, 2], [data.barangays, data.cities, 2]]) {
  const codes = new Set(parents.map(row => row[0]));
  for (const row of rows) if (!codes.has(row[parentIndex])) throw new Error(`Missing parent for ${row[0]}`);
}
await mkdir(output, { recursive: true });
await writeFile(new URL("philippine-locations.json", output), JSON.stringify(data));
await writeFile(new URL("PSGC-LICENSE.txt", output), license);
await writeFile(new URL("PSGC-SOURCE.md", output), `# Philippine location dropdown data\n\nSource: ${data.source}\nPinned commit: ${commit}\nRelease: ${data.release}\nLicense: MIT; see PSGC-LICENSE.txt.\n\nGenerated with node scripts/import-philippine-locations.mjs. Only codes, names, and parent relationships are retained. Manila district barangays are attached directly to City of Manila for the four-level dropdown hierarchy. Province-level entries include the source's non-province parent groups (NCR and independent cities); these are not additional official provinces.\n`);
console.log(Object.fromEntries(["regions", "provinces", "cities", "barangays"].map(key => [key, data[key].length])));
