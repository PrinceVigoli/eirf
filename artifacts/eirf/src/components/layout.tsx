import React from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, FileText, FilePlus,
  Users, Activity, LogOut, Menu, X, Settings, UserSearch
} from "lucide-react";
import { useGetMe, useLogout, getGetMeQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { usePublicSettings } from "@/lib/system-api";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: user, isLoading } = useGetMe({ query: { retry: false, queryKey: getGetMeQueryKey() } });
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [isMobileOpen, setIsMobileOpen] = React.useState(false);
  const { data: station } = usePublicSettings();

  React.useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [user, isLoading, setLocation]);

  React.useEffect(() => {
    if (user) {
      navigator.serviceWorker?.controller?.postMessage({
        type: "SET_ACTIVE_OFFICER",
        officerId: user.id,
      });
    }
  }, [user]);

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        // Drop cached case data (incident details, witness statements, ...)
        // now that this officer is signed out, rather than leaving it in
        // Cache Storage until it happens to expire. The active offline
        // identity is cleared at the same time.
        navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_USER_DATA" });
        queryClient.clear();
        setLocation("/login");
      }
    });
  };

  if (isLoading || !user) return null;

  const isAdmin = user.role === "admin";

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/incidents", label: "Incident Records", icon: FileText },
    { href: "/incidents/new", label: "New Incident", icon: FilePlus },
    { href: "/persons", label: "Name Index", icon: UserSearch },
    ...(isAdmin ? [
      { href: "/officers", label: "Officers Directory", icon: Users },
      { href: "/logs", label: "System Logs", icon: Activity },
      { href: "/system", label: "System & Recovery", icon: Settings },
    ] : []),
  ];

  return (
    <div className="flex min-h-screen w-full bg-background flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b bg-sidebar text-sidebar-foreground print:hidden">
        <div className="flex items-center gap-2 font-bold text-lg">
          <div className="bg-white rounded p-0.5 shrink-0">
            <img
              src={`${import.meta.env.BASE_URL}pnp-logo.jpg`}
              alt="Philippine National Police"
              className="h-7 w-7 object-contain"
            />
          </div>
          <span>e-IRF</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setIsMobileOpen(!isMobileOpen)} className="text-white hover:text-white/80 hover:bg-white/10">
          {isMobileOpen ? <X /> : <Menu />}
        </Button>
      </div>

      {/* Sidebar */}
      <aside className={cn(
        "w-64 bg-sidebar text-sidebar-foreground flex-col border-r border-sidebar-border print:hidden",
        "fixed md:sticky top-0 h-screen z-50 transition-transform",
        isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="p-6 flex items-center gap-3 border-b border-sidebar-border">
          <div className="bg-white rounded-md p-1 shrink-0">
            <img
              src={`${import.meta.env.BASE_URL}pnp-logo.jpg`}
              alt="Philippine National Police"
              className="h-11 w-11 object-contain"
            />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight tracking-tight">{station?.stationShortName ?? "Police Station"}</h1>
            <p className="text-xs text-sidebar-foreground/70 uppercase font-semibold tracking-wider">Command Center</p>
          </div>
        </div>

        {/* Signed-in officer — quick access to their profile, above the nav */}
        <Link href="/profile" onClick={() => setIsMobileOpen(false)}>
          <div className={cn(
            "flex items-center gap-3 px-4 py-3 border-b border-sidebar-border transition-colors cursor-pointer",
            location === "/profile"
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "hover:bg-sidebar-accent/50"
          )}>
            <div className="h-9 w-9 rounded-full bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">
              {user.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{user.name}</p>
              <p className="text-xs text-sidebar-foreground/60 capitalize">View profile · {user.rank}</p>
            </div>
          </div>
        </Link>

        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} onClick={() => setIsMobileOpen(false)}>
                <div className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}>
                  <Icon className="h-5 w-5" />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border mt-auto">
          <Button
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            onClick={handleLogout}
            disabled={logout.isPending}
          >
            <LogOut className="h-4 w-4 mr-2" />
            {logout.isPending ? "Signing out..." : "Sign Out"}
          </Button>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6 md:p-8">
        {children}
      </main>
    </div>
  );
}
