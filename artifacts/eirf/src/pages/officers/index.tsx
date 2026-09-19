import React, { useState } from "react";
import { Link } from "wouter";
import { useListOfficers, useGetMe } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Shield } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function OfficerList() {
  const { data: user } = useGetMe();
  const { data: officers, isLoading } = useListOfficers();
  const [search, setSearch] = useState("");

  if (user?.role !== 'admin') {
    return <div className="p-8 text-center text-destructive font-bold text-xl">Unauthorized Access</div>;
  }

  const filteredOfficers = officers?.filter(o =>
    o.name.toLowerCase().includes(search.toLowerCase()) ||
    o.badgeNumber.toLowerCase().includes(search.toLowerCase()) ||
    o.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Officer Directory</h1>
          <p className="text-muted-foreground mt-1">Manage station personnel and system access</p>
        </div>
        <Button asChild>
          <Link href="/officers/new">
            <Plus className="w-4 h-4 mr-2" />Add Officer
          </Link>
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, badge, or username..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Officer Name</TableHead>
              <TableHead>Badge #</TableHead>
              <TableHead>Rank</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6} className="h-16 animate-pulse bg-muted/50" />
                </TableRow>
              ))
            ) : filteredOfficers?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No officers found.</TableCell>
              </TableRow>
            ) : (
              filteredOfficers?.map((officer) => (
                <TableRow key={officer.id}>
                  <TableCell className="font-semibold">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                        {officer.name.charAt(0)}
                      </div>
                      {officer.name}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">{officer.badgeNumber}</TableCell>
                  <TableCell>{officer.rank}</TableCell>
                  <TableCell>{officer.username}</TableCell>
                  <TableCell>
                    {officer.role === 'admin' ? (
                      <Badge className="gap-1"><Shield className="w-3 h-3" /> Admin</Badge>
                    ) : (
                      <Badge variant="secondary">Officer</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/officers/${officer.id}/edit`}>Edit</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
