import React, { useState } from "react";
import { Link } from "wouter";
import { useListIncidents, getListIncidentsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Printer, FileBarChart, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { getStatusColor, getStatusLabel, ALL_STATUSES } from "@/lib/incident-status";
import { usePublicSettings } from "@/lib/system-api";

// Local YYYY-MM-DD (matches how incident.date / the date filters are stored).
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function StatTile({ label, value, tone }: { label: string; value: number; tone?: "crime" | "non_crime" }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-4">
        <p className="text-2xl font-bold leading-none">{value}</p>
        <p className={
          "text-xs uppercase font-semibold tracking-wider mt-1 " +
          (tone === "crime" ? "text-destructive" : tone === "non_crime" ? "text-emerald-600" : "text-muted-foreground")
        }>{label}</p>
      </CardContent>
    </Card>
  );
}

export default function Reports() {
  const { data: station } = usePublicSettings();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Reports need the full matching set (not one page), so pull a high limit.
  // A municipal station's volume is well within this for local use.
  const params = {
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    page: 1,
    limit: 1000,
  };
  const { data, isLoading } = useListIncidents(params, {
    query: { queryKey: getListIncidentsQueryKey(params) },
  });

  const incidents = data?.incidents ?? [];
  const total = data?.total ?? 0;
  const crime = incidents.filter((i) => i.category === "crime").length;
  const nonCrime = incidents.filter((i) => i.category === "non_crime").length;
  const statusCounts = ALL_STATUSES.map((s) => ({
    status: s,
    count: incidents.filter((i) => i.status === s).length,
  }));

  const rangeLabel =
    startDate && endDate ? `${startDate} to ${endDate}`
      : startDate ? `From ${startDate}`
      : endDate ? `Up to ${endDate}`
      : "All records";

  const setThisMonth = () => {
    const now = new Date();
    setStartDate(ymd(new Date(now.getFullYear(), now.getMonth(), 1)));
    setEndDate(ymd(now));
  };
  const setThisYear = () => {
    const now = new Date();
    setStartDate(ymd(new Date(now.getFullYear(), 0, 1)));
    setEndDate(ymd(now));
  };
  const setToday = () => {
    const t = ymd(new Date());
    setStartDate(t);
    setEndDate(t);
  };
  const clearRange = () => { setStartDate(""); setEndDate(""); };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileBarChart className="w-7 h-7" /> Reports
          </h1>
          <p className="text-muted-foreground mt-1">Generate incident summary reports by date range.</p>
        </div>
        <Button onClick={() => window.print()}>
          <Printer className="w-4 h-4 mr-2" /> Print Report
        </Button>
      </div>

      {/* Filters (screen only) */}
      <Card className="shadow-sm print:hidden">
        <CardContent className="p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">From</label>
              <Input type="date" className="w-auto" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <span className="text-muted-foreground pb-2">–</span>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">To</label>
              <Input type="date" className="w-auto" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="flex gap-2 pb-0.5">
              <Button type="button" variant="outline" size="sm" onClick={setToday}>Today</Button>
              <Button type="button" variant="outline" size="sm" onClick={setThisMonth}>This Month</Button>
              <Button type="button" variant="outline" size="sm" onClick={setThisYear}>This Year</Button>
              {(startDate || endDate) && (
                <Button type="button" variant="ghost" size="sm" onClick={clearRange}>Clear</Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Print-only report header */}
      <div className="hidden print:block text-center border-b-2 border-black pb-6 mb-6">
        <div className="flex items-center justify-center gap-2 mb-2">
          <ShieldAlert className="w-8 h-8" />
          <h1 className="text-3xl font-bold font-serif uppercase tracking-widest">{station?.stationName ?? "Police Station"}</h1>
        </div>
        <p className="text-xl font-bold mt-2">INCIDENT SUMMARY REPORT</p>
        <p className="text-sm mt-1">Period: {rangeLabel}</p>
        <p className="text-sm">Generated: {format(new Date(), "MMM d, yyyy HH:mm")}</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile label="Total Incidents" value={total} />
        <StatTile label="Crime" value={crime} tone="crime" />
        <StatTile label="Non-Crime" value={nonCrime} tone="non_crime" />
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">By Status</CardTitle>
          <CardDescription>{rangeLabel}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {statusCounts.map(({ status, count }) => (
              <div key={status} className="flex items-center gap-2 rounded-md border px-3 py-2">
                <Badge {...getStatusColor(status)}>{getStatusLabel(status)}</Badge>
                <span className="font-semibold">{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm overflow-hidden">
        <CardHeader className="print:hidden">
          <CardTitle className="text-base">Incidents</CardTitle>
          <CardDescription>
            {isLoading ? "Loading…" : `${incidents.length} record${incidents.length === 1 ? "" : "s"} shown${total > incidents.length ? ` of ${total}` : ""}`}
          </CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Incident No.</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Officer</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : incidents.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No incidents in this period.</TableCell></TableRow>
            ) : (
              incidents.map((incident) => (
                <TableRow key={incident.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    <Link href={`/incidents/${incident.id}`} className="hover:underline print:no-underline">{incident.incidentNumber}</Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{incident.date}</TableCell>
                  <TableCell>
                    <Badge variant={incident.category === "crime" ? "destructive" : "outline"}>{incident.type}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate" title={incident.location}>{incident.location}</TableCell>
                  <TableCell>{incident.reportingOfficerName || "Unknown"}</TableCell>
                  <TableCell><Badge {...getStatusColor(incident.status)}>{getStatusLabel(incident.status)}</Badge></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
