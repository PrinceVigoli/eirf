import React, { useEffect, useRef, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useGetIncident,
  useUpdateIncident,
  useGetMe,
  getGetIncidentQueryKey,
  useListOfficerRoster,
  useListIncidentPersons,
  useAddIncidentPerson,
  useRemoveIncidentPerson,
  getListIncidentPersonsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { EvidencePanel } from "@/components/evidence-panel";
import { useToast } from "@/hooks/use-toast";
import { INCIDENT_TYPES, INCIDENT_TYPE_GROUPS } from "@/lib/incident-types";
import { allowedNextStatuses, ALL_STATUSES, getStatusLabel } from "@/lib/incident-status";
import { PersonsInvolvedField, type PersonInvolved } from "@/components/persons-involved-field";

const schema = z.object({
  date: z.string().min(1, "Date is required"),
  time: z.string().min(1, "Time is required"),
  // Distinct from `date` (when the incident happened) — when the report was
  // *filed*. Mirrors new.tsx: required here even though IncidentUpdate's
  // field is nullable, since the server still validates it
  // (reportedDate.ts) whenever it's sent.
  dateReported: z.string().min(1, "Date reported is required"),
  location: z.string().min(3, "Location must be at least 3 characters"),
  type: z.enum(INCIDENT_TYPES, { message: "Type is required" }),
  description: z.string().min(10, "Description must be at least 10 characters"),
  witnessStatements: z.string().optional().nullable(),
  evidence: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(ALL_STATUSES),
  // Optional; "unassigned" is represented as null in form state (Radix
  // Select can't hold an empty-string value). IncidentUpdate's field is
  // `number | null | undefined`, so — unlike on create — this null can be
  // sent straight through with no normalization to undefined.
  investigatingOfficerId: z.number().nullable().optional(),
});

type FormData = z.infer<typeof schema>;

export default function EditIncident() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: incident, isLoading } = useGetIncident(id, {
    query: { enabled: !!id, queryKey: getGetIncidentQueryKey(id) }
  });
  const { data: me } = useGetMe();
  const isAdmin = me?.role === "admin";
  const updateIncident = useUpdateIncident();
  const { toast } = useToast();
  const { data: officerRoster } = useListOfficerRoster();

  // Persons Involved: unlike new.tsx (which embeds personsInvolved in the
  // create payload), this incident already exists, so each add/remove is
  // its own immediate call against /incidents/:id/persons rather than
  // something bundled into "Save Changes" — IncidentUpdate has no
  // personsInvolved field to send it through anyway. Mirrors EvidencePanel
  // below, which persists independently of the form for the same reason.
  const { data: incidentPersons } = useListIncidentPersons(id, {
    query: { enabled: !!id, queryKey: getListIncidentPersonsQueryKey(id) }
  });
  const [personsInvolved, setPersonsInvolved] = useState<PersonInvolved[]>([]);
  // useRemoveIncidentPerson needs the link row's own id, but PersonInvolved
  // only carries personId — keep the link id on the side, keyed by
  // personId (the UI only ever shows one row per person).
  const linkIdByPersonId = useRef(new Map<number, number>());
  const addIncidentPerson = useAddIncidentPerson();
  const removeIncidentPerson = useRemoveIncidentPerson();

  useEffect(() => {
    if (incidentPersons) {
      linkIdByPersonId.current = new Map(incidentPersons.map((link): [number, number] => [link.personId, link.id]));
      setPersonsInvolved(
        incidentPersons.map((link) => ({
          personId: link.personId,
          name: link.person.fullName,
          alias: link.person.alias ?? null,
          role: link.role,
        })),
      );
    }
  }, [incidentPersons]);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { date: "", time: "", dateReported: "", location: "", type: "Crime", description: "", witnessStatements: "", evidence: "", notes: "", status: "open", investigatingOfficerId: null }
  });

  const status = form.watch("status");

  useEffect(() => {
    if (incident) {
      form.reset({
        date: incident.date,
        time: incident.time,
        // `incident.dateReported` is nullable (older records created
        // before this field existed may not have one) — fall back to an
        // empty string so the required validator prompts the officer to
        // backfill it rather than silently submitting a missing value.
        dateReported: incident.dateReported ?? "",
        location: incident.location,
        type: incident.type,
        description: incident.description,
        witnessStatements: incident.witnessStatements,
        evidence: incident.evidence,
        notes: incident.notes,
        status: incident.status,
        investigatingOfficerId: incident.investigatingOfficerId ?? null,
      });
    }
  }, [incident, form]);

  // Applies one PersonsInvolvedField change (add, remove, or role swap) as
  // immediate add/remove calls, diffing the previous value against the new
  // one. There's no PATCH for a link's role — only add/remove — and the
  // (incidentId, personId, role) unique constraint means a role change has
  // to unlink the old role before linking the new one, so per-person work
  // runs sequentially rather than in parallel.
  const handlePersonsChange = (next: PersonInvolved[]) => {
    const prev = personsInvolved;
    setPersonsInvolved(next);

    const prevByPersonId = new Map(prev.map((item): [number, PersonInvolved] => [item.personId, item]));
    const nextByPersonId = new Map(next.map((item): [number, PersonInvolved] => [item.personId, item]));
    const personIds = new Set([...prevByPersonId.keys(), ...nextByPersonId.keys()]);

    for (const personId of personIds) {
      const prevItem = prevByPersonId.get(personId);
      const nextItem = nextByPersonId.get(personId);
      if (prevItem && nextItem && prevItem.role === nextItem.role) continue;

      void (async () => {
        try {
          if (prevItem) {
            const linkId = linkIdByPersonId.current.get(personId);
            if (linkId != null) {
              await removeIncidentPerson.mutateAsync({ id, linkId });
              linkIdByPersonId.current.delete(personId);
            }
          }
          if (nextItem) {
            const created = await addIncidentPerson.mutateAsync({ id, data: { personId, role: nextItem.role } });
            linkIdByPersonId.current.set(personId, created.id);
          }
          queryClient.invalidateQueries({ queryKey: getListIncidentPersonsQueryKey(id) });
          // The incident detail page renders `incident.persons`, which is
          // backed by this query key, not the persons-list query above —
          // invalidate both so it doesn't show stale/missing persons.
          queryClient.invalidateQueries({ queryKey: getGetIncidentQueryKey(id) });
        } catch (err: any) {
          setPersonsInvolved(prev);
          toast({
            title: "Failed to update persons involved",
            description: err?.data?.error ?? err?.message ?? `Could not update ${(nextItem ?? prevItem)!.name}.`,
            variant: "destructive",
          });
        }
      })();
    }
  };

  // Warn before closing the tab / reloading with unsaved edits. (This can't
  // catch in-app link navigation the same way — wouter has no built-in
  // navigation blocker — so links that leave this form ask for confirmation
  // explicitly below instead.)
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!form.formState.isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [form.formState.isDirty]);

  const confirmDiscard = () =>
    !form.formState.isDirty || confirm("You have unsaved changes. Discard them?");

  const onSubmit = (data: FormData) => {
    updateIncident.mutate({ id, data }, {
      onSuccess: (updatedData: any) => {
        // Offline: the service worker returns a synthetic `{ queued: true }`
        // body instead of the updated incident. Don't write that into the
        // cache in place of the real record — it doesn't match the Incident
        // shape and would break every screen that reads it until the next
        // real fetch.
        if (updatedData?.queued) {
          toast({
            title: "Changes saved offline",
            description: "No connection right now — these changes are queued and will sync automatically once you're back online.",
          });
          setLocation(`/incidents/${id}`);
          return;
        }
        // PATCH /incidents/:id's response has no `persons` field (only GET
        // /incidents/:id joins persons in) — setQueryData(updatedData) would
        // blindly replace the cached incident and wipe out its persons.
        // Invalidate instead so the detail page refetches the full record.
        queryClient.invalidateQueries({ queryKey: getGetIncidentQueryKey(id) });
        setLocation(`/incidents/${id}`);
      },
      onError: (err: any) => {
        toast({
          title: "Failed to save changes",
          description: err?.data?.error ?? err?.message ?? "An unexpected error occurred.",
          variant: "destructive",
        });
      },
    });
  };

  if (isLoading) return <div className="p-8 text-center animate-pulse">Loading record...</div>;
  if (!incident) return <div className="p-8 text-center text-muted-foreground">Incident not found.</div>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href={`/incidents/${id}`} onClick={(e) => { if (!confirmDiscard()) e.preventDefault(); }}>
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit: {incident.incidentNumber}</h1>
          <p className="text-muted-foreground">Update the record details</p>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Core Details</CardTitle>
            <CardDescription>Primary facts of the incident</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label htmlFor="date">Date *</Label>
                <Input type="date" id="date" {...form.register("date")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="time">Time *</Label>
                <Input type="time" id="time" {...form.register("time")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dateReported">Date Reported *</Label>
                <Input type="date" id="dateReported" {...form.register("dateReported")} />
                {form.formState.errors.dateReported && <p className="text-sm text-destructive">{form.formState.errors.dateReported.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="type">Incident Type *</Label>
                <Controller
                  name="type"
                  control={form.control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {INCIDENT_TYPE_GROUPS.map((group) => (
                          <SelectGroup key={group.label}>
                            <SelectLabel>{group.label}</SelectLabel>
                            {group.types.map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="investigatingOfficerId">Investigating Officer</Label>
                <Controller
                  name="investigatingOfficerId"
                  control={form.control}
                  render={({ field }) => {
                    const roster = officerRoster ?? [];
                    const selected =
                      field.value == null
                        ? null
                        : roster.find((o) => String(o.id) === String(field.value));
                    return (
                      <Select
                        value={field.value == null ? "unassigned" : String(field.value)}
                        onValueChange={(v) => {
                          // Guard against spurious empty events Radix can emit
                          // while the async roster <SelectItem>s are still
                          // mounting — an unguarded Number("") would corrupt a
                          // real officer id to 0 and silently clear it on save.
                          if (v === "unassigned") field.onChange(null);
                          else if (v && !Number.isNaN(Number(v))) field.onChange(Number(v));
                        }}
                      >
                        <SelectTrigger id="investigatingOfficerId">
                          {/* Render the label explicitly: Radix's <SelectValue>
                              does not reliably resolve a controlled value whose
                              <SelectItem> mounts after the value is set. */}
                          <SelectValue>
                            {selected ? `${selected.name} (${selected.rank})` : "— Unassigned —"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">— Unassigned —</SelectItem>
                          {roster.map((officer) => (
                            <SelectItem key={officer.id} value={String(officer.id)}>
                              {officer.name} ({officer.rank})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );
                  }}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Controller
                  name="status"
                  control={form.control}
                  render={({ field }) => {
                    // Most records-management workflows don't allow jumping
                    // straight from e.g. "archived" to "open" (B5 in the
                    // audit) — only offer valid next steps from the
                    // record's current status. Admins can still reach any
                    // status, since corrections sometimes require it, but
                    // out-of-workflow options are clearly labeled so it's
                    // an intentional override rather than an accident.
                    const allowed = allowedNextStatuses(incident.status);
                    const options = isAdmin ? ALL_STATUSES : allowed;
                    return (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {options.map((s) => (
                            <SelectItem key={s} value={s}>
                              {getStatusLabel(s)}
                              {isAdmin && !allowed.includes(s) ? " (admin override)" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );
                  }}
                />
                {status === "settled" && (
                  <p className="text-xs text-muted-foreground">Settled date is recorded automatically.</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location *</Label>
              <Input id="location" {...form.register("location")} />
              {form.formState.errors.location && <p className="text-sm text-destructive">{form.formState.errors.location.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Incident Description *</Label>
              <Textarea id="description" className="min-h-[150px]" {...form.register("description")} />
              {form.formState.errors.description && <p className="text-sm text-destructive">{form.formState.errors.description.message}</p>}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm mt-6">
          <CardHeader>
            <CardTitle>Supplemental Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Witness Statements</Label>
              <Textarea className="min-h-[100px]" {...form.register("witnessStatements")} value={form.watch("witnessStatements") || ""} />
            </div>
            <div className="space-y-2">
              <Label>Evidence Summary (narrative)</Label>
              <Textarea className="min-h-[100px]" {...form.register("evidence")} value={form.watch("evidence") || ""} />
              <p className="text-xs text-muted-foreground">
                Free-text summary for the case report — separate from the structured evidence files below.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Officer Notes</Label>
              <Textarea className="min-h-[100px]" {...form.register("notes")} value={form.watch("notes") || ""} />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4 mt-6">
          <Button type="button" variant="outline" asChild>
            <Link href={`/incidents/${id}`} onClick={(e) => { if (!confirmDiscard()) e.preventDefault(); }}>Cancel</Link>
          </Button>
          <Button type="submit" disabled={updateIncident.isPending}>
            {updateIncident.isPending ? "Saving..." : <><Save className="w-4 h-4 mr-2" />Save Changes</>}
          </Button>
        </div>
      </form>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Persons Involved</CardTitle>
          <CardDescription>Link victims, complainants, suspects, and witnesses to this incident. Changes save immediately.</CardDescription>
        </CardHeader>
        <CardContent>
          <PersonsInvolvedField
            value={personsInvolved}
            onChange={handlePersonsChange}
            disabled={addIncidentPerson.isPending || removeIncidentPerson.isPending}
            label={null}
            description={null}
          />
        </CardContent>
      </Card>

      <EvidencePanel incidentId={id} />
    </div>
  );
}
