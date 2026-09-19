import React from "react";
import { Link, useLocation } from "wouter";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAddEvidenceFile, useCreateIncident, useListOfficerRoster } from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Paperclip, Save, X } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { INCIDENT_TYPES } from "@/lib/incident-types";
import { PersonsInvolvedField, type PersonInvolved } from "@/components/persons-involved-field";

const schema = z.object({
  date: z.string().min(1, "Date is required"),
  time: z.string().min(1, "Time is required"),
  // Distinct from `date` (when the incident happened) — when the report was
  // *filed*. Server defaults/validates this too (reportedDate.ts), but a
  // required field here means the officer sees the same default up front.
  dateReported: z.string().min(1, "Date reported is required"),
  location: z.string().min(3, "Location must be at least 3 characters"),
  // Constrained to the same enum the server now enforces (see U4/B4) — a
  // free-form string here could previously drift from what the API/DB
  // actually accept, silently fragmenting the "by type" dashboard chart.
  type: z.enum(INCIDENT_TYPES, { message: "Type is required" }),
  description: z.string().min(10, "Description must be at least 10 characters"),
  witnessStatements: z.string().optional(),
  evidence: z.string().optional(),
  notes: z.string().optional(),
  // "settled" is a valid status an officer can file/mark directly. The
  // server derives settledDate itself (resolveSettledDate() in
  // artifacts/api-server/src/lib/settledDate.ts stamps "today" the moment
  // status becomes "settled") — settledDate is intentionally absent from
  // IncidentInput/IncidentUpdate, so there is no client field to collect or
  // submit for it here.
  status: z.enum(['open', 'under_investigation', 'settled', 'closed', 'archived']).default('open'),
  // Optional; "unassigned" is represented as null in form state (Radix
  // Select can't hold an empty-string value) and dropped to `undefined`
  // before it reaches IncidentInput, which has no null variant on create.
  investigatingOfficerId: z.number().nullable().optional(),
});

type FormData = z.infer<typeof schema>;

export default function NewIncident() {
  const [, setLocation] = useLocation();
  const createIncident = useCreateIncident();
  const addEvidence = useAddEvidenceFile();
  const { uploadFile, isUploading, progress } = useUpload();
  const { toast } = useToast();
  const [files, setFiles] = React.useState<File[]>([]);
  const [personsInvolved, setPersonsInvolved] = React.useState<PersonInvolved[]>([]);
  const { data: officerRoster } = useListOfficerRoster();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: format(new Date(), 'yyyy-MM-dd'),
      time: format(new Date(), 'HH:mm'),
      dateReported: format(new Date(), 'yyyy-MM-dd'),
      location: "",
      type: "Crime",
      description: "",
      witnessStatements: "",
      evidence: "",
      notes: "",
      status: "open",
      investigatingOfficerId: null,
    }
  });

  const status = form.watch("status");

  const onSubmit = async (data: FormData) => {
    if (files.length > 0 && !navigator.onLine) {
      toast({
        title: "Attachments require a connection",
        description: "Reconnect to submit this report with evidence files, or remove the files to save the report offline.",
        variant: "destructive",
      });
      return;
    }
    try {
      // "Unassigned" investigator comes in as null (Select sentinel) but
      // IncidentInput's field is `number | undefined` only (no null variant
      // on create), so normalize it here rather than in form state.
      const { investigatingOfficerId, ...rest } = data;
      const payload = {
        ...rest,
        investigatingOfficerId: investigatingOfficerId ?? undefined,
        personsInvolved: personsInvolved.map((person) => ({ personId: person.personId, role: person.role })),
      };
      const incident: any = await createIncident.mutateAsync({ data: payload });
        // While offline, the service worker intercepts this POST and returns
        // a synthetic `{ queued: true }` response instead of a real created
        // incident — there is no id yet because the record hasn't reached
        // the server. Routing to `/incidents/${incident.id}` in that case
        // sends the officer to `/incidents/undefined`, which renders as a
        // "not found" error right after they filed a report — looks like a
        // failure even though the report is safely queued. Route to the
        // list instead and make the queued state explicit.
        if (incident?.queued) {
          toast({
            title: "Report saved offline",
            description: "No connection right now — this report is queued and will be submitted automatically once you're back online.",
          });
          setLocation("/incidents");
          return;
        }
        let attached = 0;
        const failed: string[] = [];
        for (const file of files) {
          const uploaded = await uploadFile(file);
          if (!uploaded) { failed.push(file.name); continue; }
          try {
            await addEvidence.mutateAsync({
              id: incident.id,
              data: {
                fileName: uploaded.metadata.name,
                objectPath: uploaded.objectPath,
                contentType: uploaded.metadata.contentType,
                fileSize: uploaded.metadata.size,
              },
            });
            attached += 1;
          } catch {
            failed.push(file.name);
          }
        }
        if (files.length > 0) {
          toast({
            title: failed.length ? "Report filed with attachment warnings" : "Report and evidence filed",
            description: failed.length
              ? `${attached} attached; ${failed.length} failed: ${failed.join(", ")}. You can retry from the incident page.`
              : `${attached} evidence file(s) attached and fingerprinted successfully.`,
            variant: failed.length ? "destructive" : "default",
          });
        }
        setLocation(`/incidents/${incident.id}`);
    } catch (err: any) {
      toast({
        title: "Failed to file report",
        description: err?.data?.error ?? err?.message ?? "An unexpected error occurred.",
        variant: "destructive",
      });
    }
  };

  const selectFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = [...(event.target.files ?? [])];
    const tooLarge = selected.filter((file) => file.size > 25 * 1024 * 1024);
    if (tooLarge.length) {
      toast({ title: "File too large", description: `${tooLarge.map((file) => file.name).join(", ")} exceeds the 25 MB per-file limit.`, variant: "destructive" });
    }
    setFiles((current) => [...current, ...selected.filter((file) => file.size <= 25 * 1024 * 1024)].slice(0, 10));
    event.target.value = "";
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/incidents"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Incident Record</h1>
          <p className="text-muted-foreground">Complete the form below to file a new report</p>
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
                <Label htmlFor="date">Date of Incident *</Label>
                <Input type="date" id="date" {...form.register("date")} />
                {form.formState.errors.date && <p className="text-sm text-destructive">{form.formState.errors.date.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="time">Time of Incident *</Label>
                <Input type="time" id="time" {...form.register("time")} />
                {form.formState.errors.time && <p className="text-sm text-destructive">{form.formState.errors.time.message}</p>}
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
                        {INCIDENT_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
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
                          // while the async roster items mount — an unguarded
                          // Number("") would corrupt the id to 0.
                          if (v === "unassigned") field.onChange(null);
                          else if (v && !Number.isNaN(Number(v))) field.onChange(Number(v));
                        }}
                      >
                        <SelectTrigger id="investigatingOfficerId">
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
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="under_investigation">Under Investigation</SelectItem>
                        <SelectItem value="settled">Settled</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                {status === "settled" && (
                  <p className="text-xs text-muted-foreground">Settled date is recorded automatically.</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Location *</Label>
              <Input id="location" placeholder="Full address or precise description" {...form.register("location")} />
              {form.formState.errors.location && <p className="text-sm text-destructive">{form.formState.errors.location.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Incident Description *</Label>
              <Textarea id="description" placeholder="Provide a detailed factual account..." className="min-h-[150px]" {...form.register("description")} />
              {form.formState.errors.description && <p className="text-sm text-destructive">{form.formState.errors.description.message}</p>}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm mt-6">
          <CardHeader>
            <CardTitle>Persons Involved</CardTitle>
            <CardDescription>Link victims, complainants, suspects, and witnesses to this incident.</CardDescription>
          </CardHeader>
          <CardContent>
            <PersonsInvolvedField
              value={personsInvolved}
              onChange={setPersonsInvolved}
              label={null}
              description={null}
            />
          </CardContent>
        </Card>

        <Card className="shadow-sm mt-6">
          <CardHeader>
            <CardTitle>Supplemental Information</CardTitle>
            <CardDescription>Optional fields for additional context</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="witnessStatements">Witness Statements</Label>
              <Textarea id="witnessStatements" placeholder="Names, contact info, and statements of witnesses..." className="min-h-[100px]" {...form.register("witnessStatements")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="evidence">Evidence Summary (narrative)</Label>
              <Textarea id="evidence" placeholder="Describe evidence collected in your own words..." className="min-h-[100px]" {...form.register("evidence")} />
              <p className="text-xs text-muted-foreground">
                This is a free-text summary for the case report. Attach the actual evidence files below.
              </p>
            </div>
            <div className="space-y-3 rounded-md border p-4">
              <div>
                <Label htmlFor="evidenceFiles" className="flex items-center gap-2"><Paperclip className="w-4 h-4" />Evidence Files</Label>
                <p className="text-xs text-muted-foreground mt-1">Up to 10 files, 25 MB each. Every stored file receives a SHA-256 integrity fingerprint.</p>
              </div>
              <Input id="evidenceFiles" type="file" multiple onChange={selectFiles} disabled={isUploading} />
              {files.length > 0 && <ul className="space-y-2">
                {files.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center justify-between text-sm rounded bg-muted px-3 py-2">
                  <span className="truncate">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</span>
                  <Button type="button" size="icon" variant="ghost" onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}><X className="w-4 h-4" /></Button>
                </li>)}
              </ul>}
              {isUploading && <p className="text-sm text-muted-foreground">Uploading evidence… {progress}%</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Additional Officer Notes</Label>
              <Textarea id="notes" placeholder="Any other observations or remarks..." className="min-h-[100px]" {...form.register("notes")} />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4 mt-6">
          <Button type="button" variant="outline" asChild>
            <Link href="/incidents">Cancel</Link>
          </Button>
          <Button type="submit" disabled={createIncident.isPending || isUploading || addEvidence.isPending}>
            {createIncident.isPending || isUploading || addEvidence.isPending ? "Filing Report & Evidence..." : (
              <><Save className="w-4 h-4 mr-2" />Submit Incident Report</>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
