import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useListPersons } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Search, Plus, UserSearch, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { PERSON_ROLES, roleLabel } from "@/lib/person-roles";
import type { PersonRole } from "@/lib/person-roles";

// Radix Tabs (used here purely as a segmented control) can't take an
// empty-string value, so "all" stands in for "no role filter" and is
// translated to `undefined` before it reaches useListPersons.
type RoleFilter = PersonRole | "all";

export default function PersonList() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");
  const [page, setPage] = useState(1);
  const limit = 20;

  // Debounce the search term so we don't fire a request on every keystroke —
  // mirrors the incidents list (see @/hooks/use-debounced-value).
  const debouncedSearch = useDebouncedValue(search, 350);

  const { data, isLoading, isError } = useListPersons({
    search: debouncedSearch || undefined,
    role: role === "all" ? undefined : role,
    page,
    limit,
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <UserSearch className="w-8 h-8 text-primary" />
            Persons
          </h1>
          <p className="text-muted-foreground mt-1">
            Search victims, complainants, suspects, and witnesses across all incidents
          </p>
        </div>
        <Button asChild>
          <Link href="/persons/new">
            <Plus className="w-4 h-4 mr-2" />
            Add Person
          </Link>
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-4 flex flex-col gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search persons by name, alias, or ID number…"
              className="pl-9"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Tabs
            value={role}
            onValueChange={(v) => { setRole(v as RoleFilter); setPage(1); }}
          >
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              {PERSON_ROLES.map((r) => (
                <TabsTrigger key={r} value={r}>{roleLabel(r)}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      {isError ? (
        <Card className="shadow-sm border-destructive/50 bg-destructive/5">
          <CardContent className="p-8 flex flex-col items-center gap-2 text-center text-destructive">
            <AlertCircle className="h-8 w-8" />
            <p className="font-medium">Failed to load persons.</p>
            <p className="text-sm text-destructive/80">
              Please try again, or contact support if the problem persists.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Alias</TableHead>
                <TableHead>ID Number</TableHead>
                <TableHead>Date of Birth</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5} className="h-14 animate-pulse bg-muted/50" />
                  </TableRow>
                ))
              ) : data?.persons.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    No persons found.
                  </TableCell>
                </TableRow>
              ) : (
                data?.persons.map((person) => (
                  <TableRow
                    key={person.id}
                    className="cursor-pointer hover:bg-muted/30"
                    // wouter's navigate() keeps this an SPA transition instead of a
                    // full reload, mirroring the incidents list's row click.
                    onClick={() => navigate(`/persons/${person.id}`)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                          {person.fullName.charAt(0).toUpperCase()}
                        </div>
                        {person.fullName}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{person.alias || "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {person.idNumber || "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {person.dateOfBirth ? format(new Date(person.dateOfBirth), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild onClick={(e) => e.stopPropagation()}>
                        <Link href={`/persons/${person.id}`}>View</Link>
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
                Showing {(page - 1) * limit + 1}–{Math.min(page * limit, data.total)} of {data.total} persons
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page * limit >= data.total} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
