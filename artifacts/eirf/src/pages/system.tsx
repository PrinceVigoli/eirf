import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cleanupOrphans, useLogIntegrity, usePublicSettings, useSystemStatus, useUpdateSettings } from "@/lib/system-api";
import { useToast } from "@/hooks/use-toast";

function bytes(value: number) {
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export default function SystemPage() {
  const { data: settings } = usePublicSettings();
  const { data: status } = useSystemStatus();
  const { data: integrity, error: integrityError } = useLogIntegrity();
  const update = useUpdateSettings();
  const { toast } = useToast();
  const [form, setForm] = React.useState(settings);
  React.useEffect(() => { if (settings) setForm(settings); }, [settings]);

  const save = () => {
    if (!form) return;
    update.mutate(form, {
      onSuccess: () => toast({ title: "Settings saved" }),
      onError: (error) => toast({ title: "Save failed", description: error.message, variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div><h1 className="text-3xl font-bold">System & Recovery</h1><p className="text-muted-foreground">Local health, integrity, backups, and station identity</p></div>
      <div className="grid md:grid-cols-2 gap-4">
        <Card><CardHeader><CardTitle>Health</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
          <p>Database: <strong>{status?.status ?? "Checking…"}</strong></p>
          <p>Incidents: {status?.database?.incidents ?? "—"}</p>
          <p>Officers: {status?.database?.officers ?? "—"}</p>
          <p>Evidence records: {status?.database?.evidence ?? "—"}</p>
          <p>Disk free: {status ? bytes(status.storage.freeBytes) : "—"}</p>
          <p>Orphan uploads eligible for cleanup: {status?.storage?.orphanUploads ?? "—"}</p>
          <Button size="sm" variant="outline" onClick={async () => {
            const result = await cleanupOrphans();
            toast({ title: "Storage cleanup complete", description: `${result.removed} orphan upload(s) removed.` });
          }}>Clean orphan uploads</Button>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Recovery</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
          <p>Last backup: {status?.lastBackupAt ? new Date(status.lastBackupAt).toLocaleString() : "No backup found"}</p>
          <p>Backup files: {status?.backupCount ?? 0}</p>
          <p>Audit chain: <strong className={integrityError ? "text-destructive" : "text-green-600"}>{integrityError ? "INVALID" : integrity?.valid ? "Valid" : "Checking…"}</strong></p>
          <p>Checked log entries: {integrity?.checkedEntries ?? "—"}</p>
          <p className="text-muted-foreground">Run <code>pnpm.cmd run backup</code> from the project directory to create a backup.</p>
        </CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Station identity</CardTitle></CardHeader><CardContent className="space-y-4">
        {form && <>
          <div><Label>Full station name</Label><Input value={form.stationName} onChange={(e) => setForm({ ...form, stationName: e.target.value })} /></div>
          <div><Label>Short station name</Label><Input value={form.stationShortName} onChange={(e) => setForm({ ...form, stationShortName: e.target.value })} /></div>
          <div><Label>Report title</Label><Input value={form.reportTitle} onChange={(e) => setForm({ ...form, reportTitle: e.target.value })} /></div>
          <Button onClick={save} disabled={update.isPending}>{update.isPending ? "Saving…" : "Save settings"}</Button>
        </>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Exports</CardTitle></CardHeader><CardContent className="flex gap-3">
        <Button variant="outline" asChild><a href="/api/incidents/export.csv" download>Export incidents CSV</a></Button>
      </CardContent></Card>
    </div>
  );
}
