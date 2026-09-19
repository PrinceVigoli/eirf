import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useListIncidents } from "@workspace/api-client-react";
import type { IncidentStatus, IncidentCategory } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Search, Plus, Filter } from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { INCIDENT_TYPES } from "@/lib/incident-types";
import type { IncidentType } from "@/lib/incident-types";
import { getStatusColor, getStatusLabel } from "@/lib/incident-status";

// Radix Select doesn't allow an empty-string item value, so "all" stands in
// for "no filter" here and gets translated back to undefined below.
const STATUS_OPTIONS = ["all", "open", "under_investigation", "settled", "closed", "archived"];
const TYPE_OPTIONS = ["all", ...INCIDENT_TYPES];
const CATEGORY_OPTIONS = ["all", "crime", "non_crime"];

// "all" plus the two IncidentCategory values ("crime"/"non_crime") — same
// "all"-sentinel pattern as STATUS_OPTIONS/TYPE_OPTIONS above (Radix Select
// disallows an empty-string item value).
function categoryOptionLabel(category: string): string {
  if (category === "all") return "All Categories";
  return category === "crime" ? "Crime" : "Non-Crime";
}

export default function IncidentList() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<IncidentStatus | "">("");
  const [type, setType] = useState<IncidentType | "">("");
  const [category, setCategory] = useState<IncidentCategory | "">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;

  // Debounce the search term so we don't fire a request on every keystroke —
  // the other filters (status/type/date) are discrete selections and don't
  // need this.
  const debouncedSearch = useDebouncedValue(search, 350);

  const { data, isLoading } = useListIncidents({
    search: debouncedSearch || undefined,
    status: status || undefined,
    type: type || undefined,
    category: category || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    page,
    limit,
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Incident Records</h1>
          <p className="text-muted-foreground mt-1">Search and manage all filed reports</p>
        </div>
        <Button asChild>
          <Link href="/incidents/new">
            <Plus className="w-4 h-4 mr-2" />
            New Incident
          </Link>
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search incidents..."
              className="pl-9"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Select
            value={status || "all"}
            onValueChange={(v) => { setStatus(v === "all" ? "" : v as IncidentStatus); setPage(1); }}
          >
            <SelectTrigger className="w-auto min-w-[10rem]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(s => (
                <SelectItem key={s} value={s}>{s === "all" ? "All Statuses" : getStatusLabel(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={type || "all"}
            onValueChange={(v) => { setType(v === "all" ? "" : v as IncidentType); setPage(1); }}
          >
            <SelectTrigger className="w-auto min-w-[10rem]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map(t => (
                <SelectItem key={t} value={t}>{t === "all" ? "All Types" : t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={category || "all"}
            onValueChange={(v) => { setCategory(v === "all" ? "" : v as IncidentCategory); setPage(1); }}
          >
            <SelectTrigger className="w-auto min-w-[10rem]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map(c => (
                <SelectItem key={c} value={c}>{categoryOptionLabel(c)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            className="w-auto"
            title="From date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
          />
          <span className="text-sm text-muted-foreground self-center hidden sm:inline">–</span>
          <Input
            type="date"
            className="w-auto"
            title="To date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
          />
          {(startDate || endDate) && (
            <button
              className="text-xs text-muted-foreground underline hover:text-foreground"
              onClick={() => { setStartDate(""); setEndDate(""); setPage(1); }}
            >
              Clear dates
            </button>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Incident No.</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Officer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7} className="h-14 animate-pulse bg-muted/50" />
                </TableRow>
              ))
            ) : data?.incidents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  No incidents found.
                </TableCell>
              </TableRow>
            ) : (
              data?.incidents.map((incident) => (
                <TableRow
                  key={incident.id}
                  className="cursor-pointer hover:bg-muted/30"
                  // wouter's navigate() keeps this an SPA transition — a full
                  // window.location.href reload was throwing away the React
                  // Query cache and flashing a blank page on every row click,
                  // undermining the offline-first UX. See U1 in the audit.
                  onClick={() => navigate(`/incidents/${incident.id}`)}
                >
                  <TableCell className="font-mono text-xs text-muted-foreground">{incident.incidentNumber}</TableCell>
                  <TableCell className="whitespace-nowrap">{incident.date}</TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span>{incident.type}</span>
                      <Badge
                        variant={incident.category === "crime" ? "destructive" : "outline"}
                        className="text-[10px] px-1.5 py-0 font-normal"
                      >
                        {categoryOptionLabel(incident.category)}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate" title={incident.location}>
                    {incident.location}
                  </TableCell>
                  <TableCell>{incident.reportingOfficerName || "Unknown"}</TableCell>
                  <TableCell>
                    <Badge {...getStatusColor(incident.status)}>
                      {getStatusLabel(incident.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild onClick={(e) => e.stopPropagation()}>
                      <Link href={`/incidents/${incident.id}`}>View</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {data && data.total > limit && (
          <div className="p-4 border-t flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, data.total)} of {data.total} records
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page * limit >= data.total} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
