import React, { useEffect, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useGetOfficer, useUpdateOfficer, useDeleteOfficer, useGetMe, getGetOfficerQueryKey, getListOfficersQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  badgeNumber: z.string().min(2, "Badge number is required"),
  rank: z.string().min(2, "Rank is required"),
  username: z.string().min(4, "Username must be at least 4 characters"),
  // Left blank to keep the current password. When filled in, must meet the
  // same 8-character minimum the server enforces (see officers.ts).
  password: z.string().optional().nullable().refine(
    (v) => !v || v.length >= 8,
    "Password must be at least 8 characters",
  ),
  role: z.enum(['admin', 'officer']),
});

type FormData = z.infer<typeof schema>;

export default function EditOfficer() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user } = useGetMe();
  const [error, setError] = useState("");
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const { data: officer, isLoading } = useGetOfficer(id, {
    query: { enabled: !!id, queryKey: getGetOfficerQueryKey(id) }
  });
  const updateOfficer = useUpdateOfficer();
  const deleteOfficer = useDeleteOfficer();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", badgeNumber: "", rank: "", username: "", password: "", role: "officer" }
  });

  useEffect(() => {
    if (officer) {
      form.reset({ name: officer.name, badgeNumber: officer.badgeNumber, rank: officer.rank, username: officer.username, role: officer.role, password: "" });
    }
  }, [officer, form]);

  if (user?.role !== 'admin') return <div className="p-8 text-center text-destructive font-bold text-xl">Unauthorized Access</div>;
  if (isLoading || !officer) return <div className="p-8 text-center animate-pulse">Loading...</div>;

  const onSubmit = (data: FormData) => {
    setError("");
    const updateData: any = { ...data };
    if (!updateData.password) delete updateData.password;
    updateOfficer.mutate({ id, data: updateData }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOfficersQueryKey() });
        setLocation(`/officers`);
      },
      onError: (err: any) => setError(err?.error || "Failed to update officer")
    });
  };

  const handleDelete = () => {
    deleteOfficer.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOfficersQueryKey() });
        setLocation("/officers");
      },
      onError: (err: any) => setError(err?.error || "Failed to delete officer")
    });
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href="/officers"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Edit Officer</h1>
            <p className="text-muted-foreground">{officer.name}</p>
          </div>
        </div>
        {user?.id !== officer.id && (
          <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setShowConfirmDelete(true)}>
            <Trash2 className="w-4 h-4 mr-2" />Remove
          </Button>
        )}
      </div>

      {showConfirmDelete && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4">
            <p className="font-medium text-destructive mb-1">Delete officer account for {officer.name}? This cannot be undone.</p>
            <p className="text-sm text-muted-foreground mb-3">
              Any incidents {officer.name} reported, and any system log entries under their name, will remain —
              they'll just show "Unknown Officer" going forward instead of being reassigned. Consider reassigning
              their open incidents to another officer first if that matters for your records.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deleteOfficer.isPending}>
                {deleteOfficer.isPending ? "Deleting..." : "Confirm Delete"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowConfirmDelete(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Personnel Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && (
              <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-md text-sm font-medium">{error}</div>
            )}
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input {...form.register("name")} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Badge Number *</Label>
                <Input {...form.register("badgeNumber")} />
              </div>
              <div className="space-y-2">
                <Label>Rank *</Label>
                <Input {...form.register("rank")} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm mt-6">
          <CardHeader>
            <CardTitle>System Access</CardTitle>
            <CardDescription>Leave password blank to keep current</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Username *</Label>
                <Input {...form.register("username")} />
              </div>
              <div className="space-y-2">
                <Label>Reset Password</Label>
                <Input type="password" placeholder="••••••••" {...form.register("password")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>System Role *</Label>
              <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" {...form.register("role")} disabled={user?.id === officer.id}>
                <option value="officer">Standard Officer</option>
                <option value="admin">System Administrator</option>
              </select>
              {user?.id === officer.id && <p className="text-xs text-muted-foreground">You cannot change your own role.</p>}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4 mt-6">
          <Button type="button" variant="outline" asChild>
            <Link href="/officers">Cancel</Link>
          </Button>
          <Button type="submit" disabled={updateOfficer.isPending}>
            {updateOfficer.isPending ? "Saving..." : <><Save className="w-4 h-4 mr-2" />Save Changes</>}
          </Button>
        </div>
      </form>
    </div>
  );
}
