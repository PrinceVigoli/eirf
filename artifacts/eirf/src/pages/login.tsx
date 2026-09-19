import React, { useState } from "react";
import { useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldAlert, User, Lock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { usePublicSettings } from "@/lib/system-api";

export default function Login() {
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const login = useLogin();
  const queryClient = useQueryClient();
  const { data: station } = usePublicSettings();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    login.mutate({ data: { username, password } }, {
      onSuccess: (response) => {
        // If items were queued offline and then failed to sync because the
        // old session expired (see B2 in the audit), don't make the officer
        // wait for the next online/offline event — retry right away now
        // that they're authenticated again.
        navigator.serviceWorker?.controller?.postMessage({
          type: "ACTIVATE_OFFICER_AND_RETRY",
          officerId: response.officer.id,
        });
        queryClient.clear();
        setLocation("/");
      },
      onError: (err: any) => {
        setError(err?.error || err?.message || "Invalid credentials");
      }
    });
  };

  return (
    <div className="min-h-screen bg-[hsl(222,47%,8%)] flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background grid pattern */}
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: 'linear-gradient(hsl(210,40%,98%) 1px, transparent 1px), linear-gradient(90deg, hsl(210,40%,98%) 1px, transparent 1px)',
        backgroundSize: '40px 40px'
      }} />

      <div className="z-10 w-full max-w-md px-6">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-blue-600 text-white p-4 rounded-2xl mb-4 shadow-lg shadow-blue-900/40">
            <ShieldAlert className="h-10 w-10" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">{station?.stationName ?? "Police Station"}</h1>
          <p className="text-blue-300/70 text-sm mt-1 uppercase tracking-widest font-mono">{station?.reportTitle ?? "Electronic Incident Records Form"}</p>
        </div>

        <Card className="shadow-2xl border-white/10 bg-white/5 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-white text-xl">Officer Sign In</CardTitle>
            <CardDescription className="text-blue-300/60">Access the command center with your credentials</CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-md text-sm font-medium">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-white/80">Officer ID / Username</Label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-white/40" />
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-10 h-11 bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-blue-400"
                    placeholder="e.g. jdoe"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-white/80">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-white/40" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 h-11 bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-blue-400"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 text-base font-semibold mt-2 bg-blue-600 hover:bg-blue-500 text-white"
                disabled={login.isPending}
              >
                {login.isPending ? "Authenticating..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-blue-300/30 text-xs mt-8 text-center z-10">
          Secure Access Portal — Authorized Personnel Only
        </p>
      </div>
    </div>
  );
}
