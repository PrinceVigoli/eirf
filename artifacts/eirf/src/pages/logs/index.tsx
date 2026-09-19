import React, { useState } from "react";
import { useListLogs, useGetMe } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldAlert, TerminalSquare } from "lucide-react";
import { format, parseISO } from "date-fns";

export default function LogsList() {
  const { data: user } = useGetMe();
  const [page, setPage] = useState(1);
  const limit = 30;
  const { data, isLoading } = useListLogs({ page, limit });

  if (user?.role !== 'admin') {
    return <div className="p-8 text-center text-destructive font-bold text-xl">Unauthorized Access</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <TerminalSquare className="w-8 h-8 text-primary" />
          System Logs
        </h1>
        <p className="text-muted-foreground mt-1">Audit trail of all administrative and system actions</p>
      </div>

      <Card className="shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Timestamp</TableHead>
              <TableHead className="w-[150px]">Officer</TableHead>
              <TableHead className="w-[150px]">Action</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={4} className="h-12 animate-pulse bg-muted/30" />
                </TableRow>
              ))
            ) : data?.logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center">
                    <ShieldAlert className="h-8 w-8 mb-2 opacity-20" />
                    <p>No system logs recorded.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              data?.logs.map((log) => (
                <TableRow key={log.id} className="font-mono text-sm hover:bg-muted/30">
                  <TableCell className="text-muted-foreground">
                    {format(parseISO(log.createdAt), 'yyyy-MM-dd HH:mm:ss')}
                  </TableCell>
                  <TableCell className="font-medium text-foreground">{log.officerName || 'SYSTEM'}</TableCell>
                  <TableCell>
                    <span className="bg-secondary/50 text-secondary-foreground px-2 py-0.5 rounded-sm text-xs font-bold uppercase tracking-wider">
                      {log.action}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground break-all">{log.details}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {data && data.total > limit && (
          <div className="p-4 border-t flex items-center justify-between bg-muted/10">
            <span className="text-sm text-muted-foreground font-mono">
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, data.total)} of {data.total}
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
