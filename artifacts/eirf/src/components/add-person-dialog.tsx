import React, { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreatePerson, type Person } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// `sex` and `idType` are free-form text columns on the server (see
// lib/db/src/schema/persons.ts) — there's no backend enum to drive these
// dropdowns. These lists mirror the full person form (pages/persons/new.tsx)
// so a person created from either place gets consistent values.
const SEX_OPTIONS = ["Male", "Female", "Other"];
const ID_TYPES = ["Passport", "Driver's License", "National ID", "Voter's ID", "Postal ID", "Other"];

// Radix <Select.Item> rejects an empty-string value (reserved internally to
// mean "no selection"), so "not specified" uses this sentinel and is
// translated to/from "" at the Controller boundary — same trick as
// pages/persons/new.tsx.
const UNSPECIFIED = "unspecified";

const schema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  alias: z.string().optional(),
  sex: z.string().optional(),
  dateOfBirth: z.string().optional(),
  contactNumber: z.string().optional(),
  idType: z.string().optional(),
  idNumber: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const defaultValues: FormData = {
  fullName: "",
  alias: "",
  sex: "",
  dateOfBirth: "",
  contactNumber: "",
  idType: "",
  idNumber: "",
};

export interface AddPersonDialogProps {
  /** Controlled visibility — mirrors the underlying Radix Dialog contract. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the newly-created person once the API call succeeds. */
  onCreated: (person: Person) => void;
  /**
   * Optional starting value for "Full Name" — e.g. prefilled from whatever
   * the officer had already typed into a PersonCombobox search box before
   * choosing to add a new person.
   */
  initialFullName?: string;
}

/**
 * Condensed "add a person on the fly" dialog for use from within another
 * form (e.g. while filing an incident). Captures just enough to create a
 * `Person` record immediately; the full profile (nationality, occupation,
 * address, email, physical description, notes) can be filled in later from
 * the Persons registry (pages/persons/edit.tsx).
 */
export function AddPersonDialog({ open, onOpenChange, onCreated, initialFullName }: AddPersonDialogProps) {
  const { toast } = useToast();
  const createPerson = useCreatePerson();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  // Re-seed the form (including any prefilled name) every time the dialog
  // opens, so each add starts from a clean slate.
  useEffect(() => {
    if (open) {
      form.reset({ ...defaultValues, fullName: initialFullName ?? "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = (data: FormData) => {
    // Creating a person here needs to hand back a real `id` synchronously so
    // the caller can add it to an in-progress list. The offline queue's
    // synthetic `{ queued: true }` response (see incidents/new.tsx) has no
    // id yet — unlike the standalone "Add Person" page, we can't let this
    // queue silently, so block it up front instead.
    if (!navigator.onLine) {
      toast({
        title: "Adding a new person requires a connection",
        description: "Reconnect to add a new person, or search for an existing one instead.",
        variant: "destructive",
      });
      return;
    }

    createPerson.mutate(
      { data },
      {
        onSuccess: (person: any) => {
          if (person?.queued) {
            // Connectivity dropped between the check above and this
            // response landing. Extremely unlikely, but without a real id
            // there is nothing safe to hand back to the caller.
            toast({
              title: "Couldn't add person while offline",
              description: "The connection dropped before this record could be saved. Try again once you're back online.",
              variant: "destructive",
            });
            return;
          }
          toast({ title: "Person added", description: `${person.fullName} is ready to be linked.` });
          onCreated(person);
          onOpenChange(false);
        },
        onError: (err: any) => {
          toast({
            title: "Failed to add person",
            description: err?.data?.error ?? err?.message ?? "An unexpected error occurred.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a New Person</DialogTitle>
          <DialogDescription>
            Capture the essentials now — the full profile can be completed later from the Persons registry.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ap-fullName">Full Name *</Label>
            <Input id="ap-fullName" autoFocus {...form.register("fullName")} />
            {form.formState.errors.fullName && (
              <p className="text-sm text-destructive">{form.formState.errors.fullName.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ap-alias">Alias</Label>
              <Input id="ap-alias" {...form.register("alias")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ap-sex">Sex</Label>
              <Controller
                name="sex"
                control={form.control}
                render={({ field }) => (
                  <Select
                    value={field.value || UNSPECIFIED}
                    onValueChange={(v) => field.onChange(v === UNSPECIFIED ? "" : v)}
                  >
                    <SelectTrigger id="ap-sex"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNSPECIFIED}>Not specified</SelectItem>
                      {SEX_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ap-dateOfBirth">Date of Birth</Label>
              <Input type="date" id="ap-dateOfBirth" {...form.register("dateOfBirth")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ap-contactNumber">Contact Number</Label>
              <Input id="ap-contactNumber" {...form.register("contactNumber")} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ap-idType">ID Type</Label>
              <Controller
                name="idType"
                control={form.control}
                render={({ field }) => (
                  <Select
                    value={field.value || UNSPECIFIED}
                    onValueChange={(v) => field.onChange(v === UNSPECIFIED ? "" : v)}
                  >
                    <SelectTrigger id="ap-idType"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNSPECIFIED}>Not specified</SelectItem>
                      {ID_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ap-idNumber">ID Number</Label>
              <Input id="ap-idNumber" {...form.register("idNumber")} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createPerson.isPending}>
              {createPerson.isPending ? "Adding..." : <><Save className="w-4 h-4 mr-2" />Add Person</>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
