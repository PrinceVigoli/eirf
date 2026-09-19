import React, { useCallback, useState } from "react";
import { Users, X } from "lucide-react";
import type { Person } from "@workspace/api-client-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PERSON_ROLES, roleLabel, type PersonRole } from "@/lib/person-roles";
import { PersonCombobox } from "@/components/person-combobox";
import { AddPersonDialog } from "@/components/add-person-dialog";
import { cn } from "@/lib/utils";

/**
 * One row of the controlled `PersonsInvolvedField` value. This is a
 * lightweight, display-ready shape, not a wire format — callers translate it
 * into whatever the API expects at submit time:
 *   - New incidents: `IncidentPersonInput[]` (`{ personId, role, roleDetails? }`)
 *     via `IncidentInput.personsInvolved`.
 *   - Editing an existing incident: individual `useAddIncidentPerson` /
 *     `useRemoveIncidentPerson` calls, the latter keyed by the link's own
 *     id (from `useListIncidentPersons`), not `personId`.
 */
export interface PersonInvolved {
  personId: number;
  name: string;
  alias?: string | null;
  role: PersonRole;
}

export interface PersonsInvolvedFieldProps {
  /** Currently-added persons and their role on this incident. */
  value: PersonInvolved[];
  onChange: (value: PersonInvolved[]) => void;
  /** Role assigned to a newly-added person before the officer changes it. */
  defaultRole?: PersonRole;
  disabled?: boolean;
  label?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}

/**
 * Composes `PersonCombobox` + `AddPersonDialog` into a single controlled
 * field for attaching persons (victims, complainants, suspects, witnesses)
 * to an incident. Designed to drop into both the new-incident form
 * (controlled local state, submitted with the incident) and the edit form
 * (add/remove against existing links) — it only manages local
 * `value`/`onChange` state and never talks to the incident endpoints
 * itself.
 */
export function PersonsInvolvedField({
  value,
  onChange,
  defaultRole = "witness",
  disabled,
  label = "Persons Involved",
  description = "Link victims, complainants, suspects, and witnesses to this incident.",
  className,
}: PersonsInvolvedFieldProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingName, setPendingName] = useState("");

  const addPerson = useCallback(
    (person: Person) => {
      // Guard against adding the same person twice (e.g. picked again from
      // a fresh search) — bump their role instead if that's ever needed.
      if (value.some((item) => item.personId === person.id)) return;
      onChange([
        ...value,
        { personId: person.id, name: person.fullName, alias: person.alias ?? null, role: defaultRole },
      ]);
    },
    [value, onChange, defaultRole],
  );

  const handleAddNew = (query: string) => {
    setPendingName(query);
    setDialogOpen(true);
  };

  const updateRole = (personId: number, role: PersonRole) => {
    onChange(value.map((item) => (item.personId === personId ? { ...item, role } : item)));
  };

  const removePerson = (personId: number) => {
    onChange(value.filter((item) => item.personId !== personId));
  };

  return (
    <div className={cn("space-y-3 rounded-md border p-4", className)}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            {label}
          </Label>
          {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
        </div>
        <PersonCombobox
          onSelect={addPerson}
          onAddNew={handleAddNew}
          excludeIds={value.map((item) => item.personId)}
          disabled={disabled}
        />
      </div>

      {value.length > 0 ? (
        <ul className="space-y-2">
          {value.map((item) => (
            <li
              key={item.personId}
              className="flex items-center justify-between gap-3 text-sm rounded bg-muted px-3 py-2"
            >
              <span className="truncate">
                {item.name}
                {item.alias && <span className="text-muted-foreground"> · {item.alias}</span>}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <Select
                  value={item.role}
                  onValueChange={(next) => updateRole(item.personId, next as PersonRole)}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PERSON_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>{roleLabel(role)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => removePerson(item.personId)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No persons added yet.</p>
      )}

      <AddPersonDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={addPerson}
        initialFullName={pendingName}
      />
    </div>
  );
}
