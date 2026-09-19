import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateOfficer, useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save } from "lucide-react";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  badgeNumber: z.string().min(2, "Badge number is required"),
  rank: z.string().min(2, "Rank is required"),
  username: z.string().min(4, "Username must be at least 4 characters"),
  // Matches the server's minimum (see officers.ts) so this fails fast in
  // the form instead of round-tripping to the API for a 400.
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(['admin', 'officer']),
});

type FormData = z.infer<typeof schema>;

export default function NewOfficer() {
  const [, setLocation] = useLocation();
  const createOfficer = useCreateOfficer();
  const { data: user } = useGetMe();
  const [error, setError] = useState("");

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", badgeNumber: "", rank: "", username: "", password: "", role: "officer" }
  });

  if (user?.role !== 'admin') {
    return <div className="p-8 text-center text-destructive font-bold text-xl">Unauthorized Access</div>;
  }

  const onSubmit = (data: FormData) => {
    setError("");
    createOfficer.mutate({ data }, {
      onSuccess: () => setLocation(`/officers`),
      onError: (err: any) => setError(err?.error || "Failed to create officer account")
    });
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/officers"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Add New Officer</h1>
          <p className="text-muted-foreground">Provision a new account for station personnel</p>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Personnel Details</CardTitle>
            <CardDescription>Identity and rank information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && (
              <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-md text-sm font-medium">{error}</div>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Full Name *</Label>
              <Input id="name" {...form.register("name")} />
              {form.formState.errors.name && <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="badgeNumber">Badge Number *</Label>
                <Input id="badgeNumber" {...form.register("badgeNumber")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rank">Rank *</Label>
                <Input id="rank" {...form.register("rank")} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm mt-6">
          <CardHeader>
            <CardTitle>System Access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="username">Username *</Label>
                <Input id="username" {...form.register("username")} />
                {form.formState.errors.username && <p className="text-sm text-destructive">{form.formState.errors.username.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password *</Label>
                <Input type="password" id="password" {...form.register("password")} />
                {form.formState.errors.password && <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">System Role *</Label>
              <Controller
                name="role"
                control={form.control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="officer">Standard Officer</SelectItem>
                      <SelectItem value="admin">System Administrator</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4 mt-6">
          <Button type="button" variant="outline" asChild>
            <Link href="/officers">Cancel</Link>
          </Button>
          <Button type="submit" disabled={createOfficer.isPending}>
            {createOfficer.isPending ? "Creating..." : <><Save className="w-4 h-4 mr-2" />Create Officer</>}
          </Button>
        </div>
      </form>
    </div>
  );
}
