import React from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center p-8">
      <h1 className="text-6xl font-bold font-mono text-primary mb-4">404</h1>
      <h2 className="text-2xl font-semibold mb-2">Record Not Found</h2>
      <p className="text-muted-foreground max-w-md mb-6">The requested resource could not be located in the system.</p>
      <Button asChild><Link href="/">Return to Dashboard</Link></Button>
    </div>
  );
}
