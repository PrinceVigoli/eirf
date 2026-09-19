import React, { useEffect } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useGetIncident, useUpdateIncident, useGetMe, getGetIncidentQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { EvidencePanel } from "@/components/evidence-panel";
import { useToast } from "@/hooks/use-toast";
import { INCIDENT_TYPES } from "@/lib/incident-types";
import { allowedNextStatuses, ALL_STATUSES } from "@/lib/incident-status";

const schema = z.object({
  date: z.string().min(1, "Date is required"),
  time: z.string().min(1, "Time is required"),
  location: z.string().min(3, "Location must be at least 3 characters"),
  type: z.enum(INCIDENT_TYPES, { message: "Type is required" }),
  description: z.string().min(10, "Description must be at least 10 characters"),
  witnessStatements: z.string().optional().nullable(),
  evidence: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(['open', 'under_investigation', 'settled', 'closed', 'archived']),
});

type FormData = z.infer<typeof schema>;

const getStatusLabel = (s: string) =>
  s.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

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

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { date: "", time: "", location: "", type: "Crime", description: "", witnessStatements: "", evidence: "", notes: "", status: "open" }
  });

  useEffect(() => {
    if (incident) {
      form.reset({
        date: incident.date,
        time: incident.time,
        location: incident.location,
        type: incident.type,
        description: incident.description,
        witnessStatements: incident.witnessStatements,
        evidence: incident.evidence,
        notes: incident.notes,
        status: incident.status,
      });
    }
  }, [incident, form]);

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
        queryClient.setQueryData(getGetIncidentQueryKey(id), updatedData);
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="date">Date *</Label>
                <Input type="date" id="date" {...form.register("date")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="time">Time *</Label>
                <Input type="time" id="time" {...form.register("time")} />
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

      <EvidencePanel incidentId={id} />
    </div>
  );
}
