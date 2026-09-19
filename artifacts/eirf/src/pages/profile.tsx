import React, { useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import {
  useChangePassword,
  useGetMe,
  getGetMeQueryKey,
  useListIncidents,
  getListIncidentsQueryKey,
  useUpdateMyProfile,
} from "@workspace/api-client-react";
import type { Incident } from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  KeyRound, ShieldCheck, BadgeCheck, ShieldAlert, FileText, Gavel,
  MapPin, Calendar, FolderOpen, ChevronRight, Camera, ImagePlus,
} from "lucide-react";
import { getStatusColor, getStatusLabel } from "@/lib/incident-status";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

// Object-storage paths (/objects/<id>) are served, auth-gated, under /api/storage.
function storageUrl(objectPath: string | null | undefined): string | null {
  return objectPath ? `/api/storage${objectPath}` : null;
}

const schema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormData = z.infer<typeof schema>;

// "under_investigation" and "open" are the two statuses that still need
// day-to-day work; everything else (settled/closed/archived) is off the
// active desk. Used for the "Active" investigation tally.
const ACTIVE_STATUSES = new Set(["open", "under_investigation"]);

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

function StatTile({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="bg-primary/10 text-primary rounded-lg p-2.5">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-bold leading-none">{value}</p>
          <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mt-1">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function CaseCard({ incident }: { incident: Incident }) {
  return (
    <Link href={`/incidents/${incident.id}`}>
      <div className="group flex items-center gap-3 rounded-lg border p-3 transition-colors cursor-pointer hover:bg-muted/40 hover:border-primary/40">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{incident.incidentNumber}</span>
            <Badge
              variant={incident.category === "crime" ? "destructive" : "outline"}
              className="text-[10px] px-1.5 py-0 font-normal"
            >
              {incident.category === "crime" ? "Crime" : "Non-Crime"}
            </Badge>
          </div>
          <p className="font-medium truncate">{incident.type}</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{incident.date}</span>
            <span className="flex items-center gap-1 min-w-0"><MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{incident.location}</span></span>
          </div>
        </div>
        <Badge {...getStatusColor(incident.status)}>{getStatusLabel(incident.status)}</Badge>
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-foreground" />
      </div>
    </Link>
  );
}

function CaseList({
  isLoading,
  incidents,
  total,
  emptyLabel,
}: {
  isLoading: boolean;
  incidents: Incident[] | undefined;
  total: number;
  emptyLabel: string;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[70px] rounded-lg border animate-pulse bg-muted/50" />
        ))}
      </div>
    );
  }
  if (!incidents || incidents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <FolderOpen className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm">{emptyLabel}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {incidents.map((incident) => (
        <CaseCard key={incident.id} incident={incident} />
      ))}
      {total > incidents.length && (
        <p className="text-xs text-muted-foreground text-center pt-1">
          Showing {incidents.length} most recent of {total}.{" "}
          <Link href="/incidents" className="underline hover:text-foreground">Browse all records</Link>
        </p>
      )}
    </div>
  );
}

export default function Profile() {
  const { data: user } = useGetMe({ query: { retry: false, queryKey: getGetMeQueryKey() } });
  const changePassword = useChangePassword();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const officerId = user?.id;

  const reportedParams = { reportingOfficerId: officerId, limit: 50 };
  const investigatingParams = { investigatingOfficerId: officerId, limit: 50 };

  const reported = useListIncidents(reportedParams, {
    query: { enabled: officerId != null, queryKey: getListIncidentsQueryKey(reportedParams) },
  });
  const investigating = useListIncidents(investigatingParams, {
    query: { enabled: officerId != null, queryKey: getListIncidentsQueryKey(investigatingParams) },
  });

  const reportedTotal = reported.data?.total ?? 0;
  const investigatingTotal = investigating.data?.total ?? 0;
  const activeInvestigations =
    investigating.data?.incidents.filter((i) => ACTIVE_STATUSES.has(i.status)).length ?? 0;

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const onSubmit = (data: FormData) => {
    changePassword.mutate(
      { data: { currentPassword: data.currentPassword, newPassword: data.newPassword } },
      {
        onSuccess: () => {
          navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_USER_DATA" });
          queryClient.clear();
          toast({ title: "Password changed", description: "Please sign in again with your new password." });
          form.reset();
          navigate("/login");
        },
        onError: (err: any) => {
          toast({
            title: "Failed to change password",
            description: err?.data?.error ?? err?.message ?? "An unexpected error occurred.",
            variant: "destructive",
          });
        },
      },
    );
  };

  // --- Profile photo upload (avatar circle + cover banner) ---
  const updateProfile = useUpdateMyProfile();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const savePhoto = (field: "avatarUrl" | "coverUrl", objectPath: string) => {
    const data = field === "avatarUrl" ? { avatarUrl: objectPath } : { coverUrl: objectPath };
    updateProfile.mutate(
      { data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          toast({ title: field === "avatarUrl" ? "Profile photo updated" : "Cover photo updated" });
        },
        onError: (err: any) => {
          toast({
            title: "Couldn't save photo",
            description: err?.data?.error ?? err?.message ?? "An unexpected error occurred.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const avatarUpload = useUpload({
    onSuccess: (r) => savePhoto("avatarUrl", r.objectPath),
    onError: (err) => toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
  });
  const coverUpload = useUpload({
    onSuccess: (r) => savePhoto("coverUrl", r.objectPath),
    onError: (err) => toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
  });

  const pickPhoto = async (
    e: React.ChangeEvent<HTMLInputElement>,
    upload: typeof avatarUpload,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Uploads go straight to storage (not through the offline-queued /api),
    // so they can't be queued — tell the officer instead of failing opaquely.
    if (!navigator.onLine) {
      toast({
        title: "Can't upload while offline",
        description: "Photo uploads need a connection. Try again once you're back online.",
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast({ title: "Not an image", description: "Please choose an image file.", variant: "destructive" });
      e.target.value = "";
      return;
    }
    await upload.uploadFile(file);
    e.target.value = "";
  };

  // Uploaded photo wins; otherwise fall back to the generated default artwork.
  const avatarSrc = storageUrl(user?.avatarUrl) ?? `${import.meta.env.BASE_URL}default-avatar.svg`;
  const coverSrc = storageUrl(user?.coverUrl) ?? `${import.meta.env.BASE_URL}default-cover.svg`;
  const savingPhoto = updateProfile.isPending || avatarUpload.isUploading || coverUpload.isUploading;

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Hidden inputs backing the avatar/cover upload buttons */}
      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e, avatarUpload)} />
      <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e, coverUpload)} />

      {/* Identity header — cover banner + avatar */}
      <Card className="shadow-sm overflow-hidden">
        <div className="h-28 bg-gradient-to-r from-sidebar to-sidebar/80 relative">
          {coverSrc ? (
            <img src={coverSrc} alt="Cover" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <ShieldAlert className="absolute right-6 top-1/2 -translate-y-1/2 w-24 h-24 text-white/5" />
          )}
          <Button
            type="button"
            size="sm"
            className="absolute right-3 top-3 h-8 gap-1.5 border-0 bg-black/40 text-white hover:bg-black/60"
            onClick={() => coverInputRef.current?.click()}
            disabled={savingPhoto}
          >
            <ImagePlus className="w-3.5 h-3.5" />
            {coverUpload.isUploading ? "Uploading…" : "Cover"}
          </Button>
        </div>
        <CardContent className="pt-0">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-12">
            <div className="relative shrink-0">
              <div className="h-24 w-24 rounded-full ring-4 ring-card shadow-md bg-blue-600 text-white flex items-center justify-center text-3xl font-bold overflow-hidden">
                {avatarSrc ? (
                  <img src={avatarSrc} alt={user?.name ?? "Avatar"} className="h-full w-full object-cover" />
                ) : (
                  user ? initials(user.name) : ""
                )}
              </div>
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={savingPhoto}
                aria-label="Change profile photo"
                className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-primary text-primary-foreground ring-2 ring-card flex items-center justify-center shadow hover:opacity-90 disabled:opacity-50"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <h1 className="text-2xl font-bold tracking-tight truncate">{user?.name ?? "—"}</h1>
              <p className="text-muted-foreground capitalize">
                {user ? `${user.rank} · ${user.role}` : ""}
              </p>
            </div>
            {user && (
              <div className="pb-1">
                <Badge variant="secondary" className="gap-1">
                  <BadgeCheck className="w-3.5 h-3.5 text-primary" />
                  Badge {user.badgeNumber}
                </Badge>
              </div>
            )}
          </div>

          {user && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 pt-5 border-t text-sm">
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-1">Username</p>
                <p className="font-mono">{user.username}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-1">Role</p>
                <p className="capitalize">{user.role}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-1">Officer Since</p>
                <p>{new Date(user.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Case activity stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile icon={FileText} label="Cases Reported" value={reportedTotal} />
        <StatTile icon={Gavel} label="Assigned Investigations" value={investigatingTotal} />
        <StatTile icon={ShieldAlert} label="Active Investigations" value={activeInvestigations} />
      </div>

      {/* Cases + security tabs */}
      <Tabs defaultValue="reported">
        <TabsList>
          <TabsTrigger value="reported">Reported</TabsTrigger>
          <TabsTrigger value="investigating">Investigating</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="reported">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="w-4 h-4" /> Cases I Reported
              </CardTitle>
              <CardDescription>Incident reports you filed.</CardDescription>
            </CardHeader>
            <CardContent>
              <CaseList
                isLoading={reported.isLoading}
                incidents={reported.data?.incidents}
                total={reportedTotal}
                emptyLabel="You haven't filed any incident reports yet."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="investigating">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Gavel className="w-4 h-4" /> Cases I'm Investigating
              </CardTitle>
              <CardDescription>Cases assigned to you as investigating officer.</CardDescription>
            </CardHeader>
            <CardContent>
              <CaseList
                isLoading={investigating.isLoading}
                incidents={investigating.data?.incidents}
                total={investigatingTotal}
                emptyLabel="No cases are currently assigned to you."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="w-4 h-4" /> Change Password
              </CardTitle>
              <CardDescription>Choose a strong password of at least 8 characters.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 max-w-md">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    {...form.register("currentPassword")}
                  />
                  {form.formState.errors.currentPassword && (
                    <p className="text-sm text-destructive">{form.formState.errors.currentPassword.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    autoComplete="new-password"
                    {...form.register("newPassword")}
                  />
                  {form.formState.errors.newPassword && (
                    <p className="text-sm text-destructive">{form.formState.errors.newPassword.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    {...form.register("confirmPassword")}
                  />
                  {form.formState.errors.confirmPassword && (
                    <p className="text-sm text-destructive">{form.formState.errors.confirmPassword.message}</p>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button type="submit" disabled={changePassword.isPending}>
                    <ShieldCheck className="w-4 h-4 mr-2" />
                    {changePassword.isPending ? "Updating…" : "Update Password"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
