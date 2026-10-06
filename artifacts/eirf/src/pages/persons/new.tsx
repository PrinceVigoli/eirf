import { PersonCultureFields } from "@/components/person-culture-fields";
import { PersonLocationFields } from "@/components/person-location-fields";
import { PersonAgeField } from "@/components/person-age-field";
import { fullNameFromParts } from "@/lib/person-fields";
import { useRefreshPersonRecords } from "@/hooks/use-refresh-person-records";
import React from "react";
import { Link, useLocation } from "wouter";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreatePerson } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// `sex` and `idType` are free-form text columns on the server (see
// lib/db/src/schema/persons.ts) — there's no backend enum to drive these
// dropdowns, so the option lists below are purely a UI convenience.
const SEX_OPTIONS = ["Male", "Female", "Other"];
const ID_TYPES = ["Passport", "Driver's License", "National ID", "Voter's ID", "Postal ID", "Other"];

// Radix <Select.Item> rejects an empty-string value (reserved internally to
// mean "no selection"), so the "not specified" option uses this sentinel and
// is translated to/from "" at the Controller boundary — the same trick the
// persons list uses for its "all roles" filter (see pages/persons/index.tsx).
const UNSPECIFIED = "unspecified";

const schema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  lastName: z.string().optional(),
  middleName: z.string().optional(),
  firstName: z.string().optional(),
  region: z.string().optional(),
  province: z.string().optional(),
  cityMunicipality: z.string().optional(),
  barangay: z.string().optional(),
  dialect: z.string().optional(),
  tribe: z.string().optional(),
  alias: z.string().optional(),
  dateOfBirth: z.string().optional(),
  sex: z.string().optional(),
  nationality: z.string().optional(),
  idType: z.string().optional(),
  idNumber: z.string().optional(),
  occupation: z.string().optional(),
  address: z.string().optional(),
  contactNumber: z.string().optional(),
  // Only validated as an email when something is actually typed in.
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  physicalDescription: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const defaultValues: FormData = {
  fullName: "",
  lastName: "",
  middleName: "",
  firstName: "",
  region: "",
  province: "",
  cityMunicipality: "",
  barangay: "",
  dialect: "",
  tribe: "",
  alias: "",
  dateOfBirth: "",
  sex: "",
  nationality: "",
  idType: "",
  idNumber: "",
  occupation: "",
  address: "",
  contactNumber: "",
  email: "",
  physicalDescription: "",
  notes: "",
};

export default function NewPerson() {
  const [, setLocation] = useLocation();
  const createPerson = useCreatePerson();
  const { toast } = useToast();
  const refreshPersonRecords = useRefreshPersonRecords();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const onSubmit = (data: FormData) => {
    createPerson.mutate({ data }, {
      onSuccess: (person: any) => {
        // Offline: the service worker intercepts this POST and returns a
        // synthetic `{ queued: true }` body instead of a real created person
        // — there is no id yet because the record hasn't reached the server.
        // Routing to `/persons/undefined` in that case would look like a
        // failure right after the officer filed the record. Mirrors the same
        // fix in incidents/new.tsx.
        if (person?.queued) {
          toast({
            title: "Saved offline",
            description: "No connection right now — this person record is queued and will sync automatically once you're back online.",
          });
          setLocation("/persons");
          return;
        }
        void refreshPersonRecords();
        toast({ title: "Person created", description: `${person.fullName} has been added to the registry.` });
        setLocation(`/persons/${person.id}`);
      },
      onError: (err: any) => {
        toast({
          title: "Failed to create person",
          description: err?.data?.error ?? err?.message ?? "An unexpected error occurred.",
          variant: "destructive",
        });
      },
    });
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/persons"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Add Person</h1>
          <p className="text-muted-foreground">Register a new person record</p>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Identity</CardTitle>
            <CardDescription>Basic identifying information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input id="lastName" {...form.register("lastName", { onChange: () => form.setValue("fullName", fullNameFromParts(form.getValues()), { shouldDirty: true, shouldValidate: true }) })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="middleName">Middle Name</Label>
                <Input id="middleName" {...form.register("middleName", { onChange: () => form.setValue("fullName", fullNameFromParts(form.getValues()), { shouldDirty: true, shouldValidate: true }) })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input id="firstName" {...form.register("firstName", { onChange: () => form.setValue("fullName", fullNameFromParts(form.getValues()), { shouldDirty: true, shouldValidate: true }) })} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name *</Label>
                <Input id="fullName" readOnly={!!fullNameFromParts(form.watch())} {...form.register("fullName")} />
                {form.formState.errors.fullName && <p className="text-sm text-destructive">{form.formState.errors.fullName.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="alias">Alias</Label>
                <Input id="alias" {...form.register("alias")} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="dateOfBirth">Date of Birth</Label>
                <Input type="date" id="dateOfBirth" {...form.register("dateOfBirth")} />
              </div>
              <PersonAgeField dateOfBirth={form.watch("dateOfBirth")} />
              <div className="space-y-2">
                <Label htmlFor="sex">Sex</Label>
                <Controller
                  name="sex"
                  control={form.control}
                  render={({ field }) => (
                    <Select value={field.value || UNSPECIFIED} onValueChange={(v) => field.onChange(v === UNSPECIFIED ? "" : v)}>
                      <SelectTrigger id="sex"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNSPECIFIED}>Not specified</SelectItem>
                        {SEX_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="nationality">Nationality</Label>
                <Input id="nationality" {...form.register("nationality")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="idType">ID Type</Label>
                <Controller
                  name="idType"
                  control={form.control}
                  render={({ field }) => (
                    <Select value={field.value || UNSPECIFIED} onValueChange={(v) => field.onChange(v === UNSPECIFIED ? "" : v)}>
                      <SelectTrigger id="idType"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNSPECIFIED}>Not specified</SelectItem>
                        {ID_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="idNumber">ID Number</Label>
                <Input id="idNumber" {...form.register("idNumber")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="occupation">Occupation</Label>
                <Input id="occupation" {...form.register("occupation")} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm mt-6">
          <CardHeader>
            <CardTitle>Contact</CardTitle>
            <CardDescription>Address and contact details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <PersonCultureFields values={form.watch()} onChange={(field, value) => form.setValue(field, value, { shouldDirty: true })} />
            <PersonLocationFields values={form.watch()} onChange={(field, value) => form.setValue(field, value, { shouldDirty: true })} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="contactNumber">Contact Number</Label>
                <Input id="contactNumber" {...form.register("contactNumber")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input type="email" id="email" {...form.register("email")} />
                {form.formState.errors.email && <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm mt-6">
          <CardHeader>
            <CardTitle>Physical Description</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              id="physicalDescription"
              className="min-h-[100px]"
              placeholder="Height, build, complexion, distinguishing marks, tattoos, scars, etc."
              {...form.register("physicalDescription")}
            />
          </CardContent>
        </Card>

        <Card className="shadow-sm mt-6">
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              id="notes"
              className="min-h-[100px]"
              placeholder="Any other observations or remarks..."
              {...form.register("notes")}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4 mt-6">
          <Button type="button" variant="outline" asChild>
            <Link href="/persons">Cancel</Link>
          </Button>
          <Button type="submit" disabled={createPerson.isPending}>
            {createPerson.isPending ? "Creating..." : <><Save className="w-4 h-4 mr-2" />Create Person</>}
          </Button>
        </div>
      </form>
    </div>
  );
}
