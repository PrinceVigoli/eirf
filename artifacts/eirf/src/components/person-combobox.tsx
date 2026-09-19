import React, { useMemo, useState } from "react";
import { useListPersons, getListPersonsQueryKey, type Person } from "@workspace/api-client-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Plus, UserPlus } from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

// Quick-pick popover, not the full Persons registry table — a small fixed
// page size keeps results scannable and avoids needing pagination here.
const RESULT_LIMIT = 8;

export interface PersonComboboxProps {
  /** Called when the officer picks an existing person from the results. */
  onSelect: (person: Person) => void;
  /**
   * Called when the officer chooses to add a brand-new person instead of
   * picking an existing match. Receives whatever text they had already
   * typed into the search box so the caller (e.g. AddPersonDialog) can
   * prefill "Full Name". The "+ Add a new person" action is hidden entirely
   * when this prop is omitted.
   */
  onAddNew?: (query: string) => void;
  /** Person IDs to hide from the results — e.g. persons already added. */
  excludeIds?: number[];
  /** Content of the trigger button. Defaults to an icon + "Add person". */
  triggerLabel?: React.ReactNode;
  /** Placeholder text for the search input. */
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Popover + Command combobox that searches existing `Person` records
 * (debounced, server-side via `useListPersons`) and lets the caller react to
 * either an existing pick (`onSelect`) or a request to create a new person
 * (`onAddNew`). This is purely a picker — it has no notion of "involved
 * persons" or roles; see `PersonsInvolvedField` for that composition.
 */
export function PersonCombobox({
  onSelect,
  onAddNew,
  excludeIds,
  triggerLabel = (
    <>
      <UserPlus className="w-4 h-4 mr-2" />
      Add person
    </>
  ),
  searchPlaceholder = "Search by name, alias, or ID number…",
  disabled,
  className,
}: PersonComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);

  // Gate the fetch on `open` so this never polls in the background while the
  // popover is closed. `queryKey` has to be supplied explicitly here (rather
  // than left to the hook's own default) because @tanstack/react-query v5's
  // `UseQueryOptions` type requires it — see the same pattern in
  // components/evidence-panel.tsx.
  const searchParams = { search: debouncedQuery || undefined, limit: RESULT_LIMIT };
  const { data, isLoading } = useListPersons(searchParams, {
    query: { queryKey: getListPersonsQueryKey(searchParams), enabled: open },
  });

  const excluded = useMemo(() => new Set(excludeIds ?? []), [excludeIds]);
  const persons = useMemo(
    () => (data?.persons ?? []).filter((person) => !excluded.has(person.id)),
    [data, excluded],
  );

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const handleSelect = (person: Person) => {
    onSelect(person);
    close();
  };

  const handleAddNew = () => {
    if (!onAddNew) return;
    onAddNew(query.trim());
    close();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled} className={className}>
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder={searchPlaceholder} />
          <CommandList>
            {isLoading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Searching…</div>
            ) : persons.length === 0 ? (
              <CommandEmpty>
                <div className="flex flex-col items-center gap-2 px-2 py-2 text-center">
                  <p className="text-sm text-muted-foreground">
                    {query.trim() ? `No persons match "${query.trim()}".` : "No persons on file yet."}
                  </p>
                  {onAddNew && (
                    <Button type="button" variant="ghost" size="sm" onClick={handleAddNew}>
                      <Plus className="w-4 h-4 mr-1" />
                      Add a new person
                    </Button>
                  )}
                </div>
              </CommandEmpty>
            ) : (
              <>
                <CommandGroup heading="Existing persons">
                  {persons.map((person) => {
                    const meta = [person.alias, person.idNumber ? `ID ${person.idNumber}` : null]
                      .filter((part): part is string => Boolean(part && part.trim()))
                      .join(" · ");
                    return (
                      <CommandItem
                        key={person.id}
                        value={`${person.id}-${person.fullName}`}
                        onSelect={() => handleSelect(person)}
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="truncate">{person.fullName}</span>
                          {meta && <span className="text-xs text-muted-foreground truncate">{meta}</span>}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
                {onAddNew && (
                  <>
                    <CommandSeparator />
                    <CommandGroup>
                      <CommandItem value="__add_new_person__" onSelect={handleAddNew}>
                        <Plus className="w-4 h-4 mr-1" />
                        Add a new person
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
