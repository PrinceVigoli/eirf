import type { LocationField } from "./person-fields";

export interface PhilippineLocations {
  regions: [string, string][];
  provinces: [string, string, string][];
  cities: [string, string, string, string][];
  barangays: [string, string, string][];
}
export type LocationValues = Partial<Record<LocationField, string | null>>;

export function createLocationOptions(data: PhilippineLocations) {
  const barangaysByCity = new Map<string, string[]>();
  for (const [, name, city] of data.barangays) {
    const names = barangaysByCity.get(city) ?? [];
    names.push(name);
    barangaysByCity.set(city, names);
  }
  return (field: LocationField, values: LocationValues): string[] => {
    if (field === "region") return data.regions.map(row => row[1]);
    const region = data.regions.find(row => row[1] === values.region)?.[0];
    if (!region) return [];
    if (field === "province") return data.provinces.filter(row => row[2] === region).map(row => row[1]);
    const province = data.provinces.find(row => row[2] === region && row[1] === values.province)?.[0];
    if (!province) return [];
    if (field === "cityMunicipality") return data.cities.filter(row => row[2] === province).map(row => row[1]);
    const city = data.cities.find(row => row[2] === province && row[1] === values.cityMunicipality)?.[0];
    return field === "barangay" && city ? barangaysByCity.get(city) ?? [] : [];
  };
}
