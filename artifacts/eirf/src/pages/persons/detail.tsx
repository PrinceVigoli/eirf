import React from "react";
import { Link, useParams } from "wouter";
import {
  useGetPerson,
  useGetPersonIncidents,
  getGetPersonQueryKey,
  getGetPersonIncidentsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit, Cake, VenusAndMars, Globe, IdCard, Fingerprint, ChevronRight } from "lucide-react";
import { format, differenceInYears } from "date-fns";
import { roleBadgeVariant, roleLabel } from "@/lib/person-roles";

// Label/value row for the left-hand bio cards — mirrors the "Status" row
// style from incidents/detail.tsx's right rail (small-caps muted label over
// a plain value), reused here in a 2-column grid for the Identity/Contact
// cards. Null/empty values are omitted entirely rather than rendering a
// blank row.
function BioField({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-1">{label}</p>
      <p className="text-sm font-medium break-words">{value}</p>
    </div>
  );
}

// Icon-prefixed row for the right rail "quick facts" panel — mirrors the
// Type/Date/Location/Officer rows from incidents/detail.tsx's sidebar card.
function QuickFact({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-muted-foreground mt-0.5" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

export default function PersonDetail() {
  const params = useParams();
  const id = Number(params.id);

  const { data: person, isLoading } = useGetPerson(id, {
    query: { enabled: !!id, queryKey: getGetPersonQueryKey(id) }
  });
  // Fetched in parallel with the person record (not gated behind it) so the
  // linked-cases list doesn't waterfall behind the bio fetch.
  const { data: personIncidents, isLoading: incidentsLoading } = useGetPersonIncidents(id, {
    query: { enabled: !!id, queryKey: getGetPersonIncidentsQueryKey(id) }
  });

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="h-10 w-48 bg-muted animate-pulse rounded-md" />
        <Card className="h-96 bg-muted animate-pulse shadow-sm" />
      </div>
    );
  }

  if (!person) {
    return <div className="text-center p-12 text-muted-foreground">Person not found.</div>;
  }

  const age = person.dateOfBirth ? differenceInYears(new Date(), new Date(person.dateOfBirth)) : null;
  const linkedIncidents = personIncidents ?? [];

  const hasIdentity = !!(
    person.dateOfBirth || person.sex || person.nationality || person.idType || person.idNumber || person.occupation
  );
  const hasContact = !!(person.address || person.contactNumber || person.email);
  const hasQuickFacts = !!(person.dateOfBirth || person.sex || person.nationality || person.idType || person.idNumber);
  const hasAnyBio = hasIdentity || hasContact || !!person.physicalDescription || !!person.notes;

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href="/persons"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{person.fullName}</h1>
            {person.alias && <p className="text-muted-foreground">{person.alias}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href={`/persons/${person.id}/edit`}>
              <Edit className="w-4 h-4 mr-2" />Edit Person
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          {hasIdentity && (
            <Card className="shadow-sm">
              <CardHeader><CardTitle>Identity</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <BioField
                    label="Date of Birth"
                    value={person.dateOfBirth ? format(new Date(person.dateOfBirth), "MMM d, yyyy") : null}
                  />
                  <BioField label="Sex" value={person.sex} />
                  <BioField label="Nationality" value={person.nationality} />
                  <BioField label="Occupation" value={person.occupation} />
                  <BioField label="ID Type" value={person.idType} />
                  <BioField label="ID Number" value={person.idNumber} />
                </div>
              </CardContent>
            </Card>
          )}

          {hasContact && (
            <Card className="shadow-sm">
              <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <BioField label="Address" value={person.address} />
                  <BioField label="Contact Number" value={person.contactNumber} />
                  <BioField label="Email" value={person.email} />
                </div>
              </CardContent>
            </Card>
          )}

          {person.physicalDescription && (
            <Card className="shadow-sm">
              <CardHeader><CardTitle>Physical Description</CardTitle></CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{person.physicalDescription}</p>
              </CardContent>
            </Card>
          )}

          {person.notes && (
            <Card className="shadow-sm">
              <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{person.notes}</p>
              </CardContent>
            </Card>
          )}

          {!hasAnyBio && (
            <Card className="shadow-sm">
              <CardContent className="p-8 text-center text-muted-foreground">
                No additional bio details on file.
              </CardContent>
            </Card>
          )}

          <Card className="shadow-sm">
            <CardHeader><CardTitle>Linked Cases</CardTitle></CardHeader>
            <CardContent>
              {incidentsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-14 animate-pulse bg-muted/50 rounded-md" />
                  ))}
                </div>
              ) : linkedIncidents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Not linked to any cases yet.</p>
              ) : (
                <div className="divide-y">
                  {linkedIncidents.map((incident) => (
                    <Link
                      key={incident.id}
                      href={`/incidents/${incident.id}`}
                      className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0 -mx-2 px-2 rounded-md hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Badge variant={roleBadgeVariant(incident.role)}>{roleLabel(incident.role)}</Badge>
                        <div className="min-w-0">
                          <p className="font-mono text-sm font-medium truncate">{incident.incidentNumber}</p>
                          {/* incident.date is rendered raw (not date-fns formatted), matching how
                              incidents/index.tsx and incidents/detail.tsx display this same field. */}
                          <p className="text-xs text-muted-foreground truncate">{incident.type} &middot; {incident.date}</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="shadow-sm">
            <CardContent className="p-6 space-y-4">
              {hasQuickFacts ? (
                <>
                  <QuickFact
                    icon={Cake}
                    label="Date of Birth"
                    value={
                      person.dateOfBirth ? (
                        <>
                          {format(new Date(person.dateOfBirth), "MMM d, yyyy")}
                          {age !== null && <span className="text-muted-foreground font-normal"> ({age} yrs)</span>}
                        </>
                      ) : null
                    }
                  />
                  <QuickFact icon={VenusAndMars} label="Sex" value={person.sex} />
                  <QuickFact icon={Globe} label="Nationality" value={person.nationality} />
                  <QuickFact icon={IdCard} label="ID Type" value={person.idType} />
                  <QuickFact icon={Fingerprint} label="ID Number" value={person.idNumber} />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No identifying details on file.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
