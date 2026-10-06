import { useId } from "react";
import { useListPersonLocations } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { locationFields, type LocationField } from "@/lib/person-fields";
import { usePhilippineLocations } from "@/hooks/use-philippine-locations";

export function PersonLocationFields({ values, onChange, search = false }: {
  values: Partial<Record<LocationField, string>>;
  onChange: (field: LocationField, value: string) => void;
  search?: boolean;
}) {
  const id = useId();
  const { data: locations = [], isError: savedError } = useListPersonLocations();
  const { data: geographicOptions, isPending, isError, refetch } = usePhilippineLocations();
  return <div className="space-y-3">
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${search ? "lg:grid-cols-5" : ""} gap-4`}>
      {locationFields.map(([field, label], index) => {
        if (field === "address") return <div key={field} className="space-y-2">
          <Label htmlFor={`${id}-address`}>Address</Label>
          <Input id={`${id}-address`} value={values.address ?? ""} placeholder="Type here"
            onChange={event => onChange("address", event.target.value)} />
        </div>;
        const savedOptions = locations.filter(location =>
          locationFields.slice(0, index).every(([parent]) => !values[parent] || location[parent] === values[parent])
        ).map(location => location[field]).filter((value): value is string => !!value?.trim());
        const value = values[field] ?? "";
        const options = [...new Set([
          ...(geographicOptions?.(field, values) ?? []),
          ...(search ? savedOptions : []),
          ...(value ? [value] : []),
        ])].sort((a, b) => a.localeCompare(b));
        const missingParent = locationFields.slice(0, index).some(([parent]) => !values[parent]);
        const change = (next: string) => {
          onChange(field, next);
          locationFields.slice(index + 1).forEach(([child]) => onChange(child, ""));
        };
        return <div key={field} className="space-y-2">
          <Label htmlFor={`${id}-${field}`}>{label}</Label>
          <select id={`${id}-${field}`} value={value ? `saved:${value}` : ""}
            disabled={!value && (isPending || isError || missingParent)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={event => {
              const next = event.target.value;
              change(next.replace(/^saved:/, ""));
            }}>
            <option value="">{search ? "All" : "Select"} {label.toLowerCase()}</option>
            {options.map(option => <option key={option} value={`saved:${option}`}>{option}</option>)}
          </select>
        </div>;
      })}
    </div>
    {isError ? <div className="text-sm text-destructive">Philippine locations could not be loaded. <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>Retry</Button></div>
      : <p className="text-xs text-muted-foreground">{isPending ? "Loading Philippine locations..." : "Select a region, province, city/municipality, then barangay. For NCR or an independent city, choose its named area in Province."}</p>}
    {search && savedError && <p className="text-xs text-muted-foreground">Saved location options could not be loaded.</p>}
  </div>;
}
