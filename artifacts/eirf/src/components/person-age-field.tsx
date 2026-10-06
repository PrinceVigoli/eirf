import { useId } from "react";
import { differenceInYears, parseISO } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PersonAgeField({ dateOfBirth }: { dateOfBirth?: string }) {
  const id = useId();
  const birth = dateOfBirth ? parseISO(dateOfBirth) : null;
  const age = birth && !isNaN(birth.getTime()) ? differenceInYears(new Date(), birth) : null;
  return <div className="space-y-2">
    <Label htmlFor={id}>Age</Label>
    <Input id={id} readOnly value={age !== null && age >= 0 ? age : ""} placeholder="Calculated from date of birth" />
  </div>;
}
