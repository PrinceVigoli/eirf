import React from "react";
import { Link, useParams } from "wouter";
import { useGetIncident, getGetIncidentQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Printer, Edit, Calendar, CalendarCheck, MapPin, Tag, User, UserCog, ShieldAlert, Download, CheckCircle2, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { EvidencePanel } from "@/components/evidence-panel";
import { usePublicSettings } from "@/lib/system-api";
import { getStatusColor, getStatusLabel } from "@/lib/incident-status";
import { roleBadgeVariant, roleLabel, type PersonRole } from "@/lib/person-roles";
import { cn } from "@/lib/utils";

// Groups for the "Persons Involved" card — suspects surfaced first since
// they're typically the most operationally relevant, then victims,
// complainants, and witnesses.
const ROLE_GROUPS: PersonRole[] = ["suspect", "victim", "complainant", "witness"];
const ROLE_GROUP_LABELS: Record<PersonRole, string> = {
  suspect: "Suspects",
  victim: "Victims",
  complainant: "Complainants",
  witness: "Witnesses",
};

export default function IncidentDetail() {
  const params = useParams();
  const id = Number(params.id);
  const { data: incident, isLoading } = useGetIncident(id, {
    query: { enabled: !!id, queryKey: getGetIncidentQueryKey(id) }
  });
  const { data: station } = usePublicSettings();

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="h-10 w-48 bg-muted animate-pulse rounded-md" />
        <Card className="h-96 bg-muted animate-pulse shadow-sm" />
      </div>
    );
  }

  if (!incident) {
    return <div className="text-center p-12 text-muted-foreground">Incident not found.</div>;
  }

  // persons is optional on the wire (older records / partial responses);
  // default to empty so the grouping below doesn't need repeated `?? []`.
  const persons = incident.persons ?? [];
  const categoryLabel = incident.category === "crime" ? "Crime" : "Non-Crime";

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href="/incidents"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight font-mono">{incident.incidentNumber}</h1>
            <p className="text-muted-foreground">Incident Record Detail</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href={`/api/incidents/${incident.id}/evidence-manifest`} download>
              <Download className="w-4 h-4 mr-2" />Evidence Manifest
            </a>
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" />Print Report
          </Button>
          <Button asChild>
            <Link href={`/incidents/${incident.id}/edit`}>
              <Edit className="w-4 h-4 mr-2" />Edit Record
            </Link>
          </Button>
        </div>
      </div>

      {/* Print-only Header */}
      <div className="hidden print:block text-center border-b-2 border-black pb-6 mb-6">
        <div className="flex items-center justify-center gap-2 mb-2">
          <ShieldAlert className="w-8 h-8" />
          <h1 className="text-3xl font-bold font-serif uppercase tracking-widest">{station?.stationName ?? "Police Station"}</h1>
        </div>
        <p className="text-xl font-bold mt-2">OFFICIAL INCIDENT REPORT</p>
        <p className="text-sm font-mono mt-1">RECORD ID: {incident.incidentNumber}</p>
        <p className="text-sm">Generated: {format(new Date(), "MMM d, yyyy HH:mm")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card className="shadow-sm">
            <CardHeader><CardTitle>Incident Description</CardTitle></CardHeader>
            <CardContent>
              <div className="prose max-w-none text-foreground print:text-black">
                {incident.description.split('\n').map((p, i) => <p key={i}>{p}</p>)}
              </div>
            </CardContent>
          </Card>

          {/* No print:hidden here — persons involved stay on the printed report. */}
          <Card className="shadow-sm">
            <CardHeader><CardTitle>Persons Involved</CardTitle></CardHeader>
            <CardContent>
              {persons.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No persons linked.</p>
              ) : (
                <div className="space-y-4">
                  {ROLE_GROUPS.map((role) => {
                    const members = persons.filter((ip) => ip.role === role);
                    if (members.length === 0) return null;
                    return (
                      <div key={role}>
                        <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-2">
                          {ROLE_GROUP_LABELS[role]}
                        </p>
                        <div className="divide-y">
                          {members.map((ip) => (
                            <Link
                              key={ip.id}
                              href={`/persons/${ip.personId}`}
                              className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0 -mx-2 px-2 rounded-md hover:bg-muted/30 transition-colors"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <Badge variant={roleBadgeVariant(ip.role)}>{roleLabel(ip.role)}</Badge>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{ip.person.fullName}</p>
                                  {ip.person.alias && (
                                    <p className="text-xs text-muted-foreground truncate">{ip.person.alias}</p>
                                  )}
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                            </Link>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {incident.witnessStatements && (
            <Card className="shadow-sm">
              <CardHeader><CardTitle>Witness Statements</CardTitle></CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{incident.witnessStatements}</p>
              </CardContent>
            </Card>
          )}

          {incident.evidence && (
            <Card className="shadow-sm">
              <CardHeader><CardTitle>Evidence Recovered</CardTitle></CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{incident.evidence}</p>
              </CardContent>
            </Card>
          )}

          {incident.notes && (
            <Card className="shadow-sm">
              <CardHeader><CardTitle>Officer Notes</CardTitle></CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{incident.notes}</p>
              </CardContent>
            </Card>
          )}

          <EvidencePanel incidentId={incident.id} />
        </div>

        <div className="space-y-4">
          <Card className="shadow-sm">
            <CardContent className="p-6 space-y-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-1">Status</p>
                <Badge variant={getStatusColor(incident.status).variant} className={cn("text-sm", getStatusColor(incident.status).className)}>
                  {getStatusLabel(incident.status)}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-1">Category</p>
                <Badge variant={incident.category === "crime" ? "destructive" : "outline"}>
                  {categoryLabel}
                </Badge>
              </div>
              <div className="flex items-start gap-3">
                <Tag className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <p className="text-sm font-medium">{incident.type}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Date & Time</p>
                  <p className="text-sm font-medium">{incident.date} at {incident.time}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CalendarCheck className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Date Reported</p>
                  <p className="text-sm font-medium">{incident.dateReported || "Not recorded"}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Location</p>
                  <p className="text-sm font-medium">{incident.location}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <User className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Reporting Officer</p>
                  <p className="text-sm font-medium">{incident.reportingOfficerName || "Unknown"}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <UserCog className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Investigating Officer</p>
                  <p className="text-sm font-medium">{incident.investigatingOfficerName || "Unassigned"}</p>
                </div>
              </div>
              {incident.status === "settled" && (
                <div className="flex items-start gap-3">
                  {/* settledDate is server-managed (set on transition to "settled")
                      and read-only here — display only, no edit affordance. */}
                  <CheckCircle2 className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Settled</p>
                    <p className="text-sm font-medium">{incident.settledDate || "Not recorded"}</p>
                  </div>
                </div>
              )}
              <div className="pt-2 border-t text-xs text-muted-foreground space-y-1">
                <p>Filed: {format(new Date(incident.createdAt), "MMM d, yyyy HH:mm")}</p>
                <p>Updated: {format(new Date(incident.updatedAt), "MMM d, yyyy HH:mm")}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
