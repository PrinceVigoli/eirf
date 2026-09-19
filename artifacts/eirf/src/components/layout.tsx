import React from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, FileText, FilePlus,
  Users, Activity, LogOut, Menu, X, Settings, UserSearch,
  PanelLeftClose, PanelLeftOpen
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
  // Desktop sidebar collapse (icon rail), remembered per browser. Wrapped in
  // try/catch because localStorage can throw in private windows / blocked storage.
  const [collapsed, setCollapsed] = React.useState<boolean>(() => {
    try { return localStorage.getItem("eirf-sidebar-collapsed") === "1"; } catch { return false; }
  });
  const toggleCollapsed = () => setCollapsed((c) => {
    const next = !c;
    try { localStorage.setItem("eirf-sidebar-collapsed", next ? "1" : "0"); } catch { /* ignore */ }
    return next;
  });
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
        "bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border print:hidden",
        "fixed md:sticky top-0 h-screen z-50 transition-[width,transform] duration-200 w-64",
        collapsed && "md:w-[4.5rem]",
        isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        {/* Collapse toggle — top-right on desktop (mobile uses the slide-in drawer) */}
        <div className={cn("hidden md:flex items-center px-3 pt-3", collapsed ? "justify-center" : "justify-end")}>
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
        <div className={cn(
          "flex items-center gap-3 px-6 pt-3 pb-6 border-b border-sidebar-border",
          collapsed && "md:flex-col md:gap-2 md:p-3"
        )}>
          <div className="bg-white rounded-md p-1 shrink-0">
            <img
              src={`${import.meta.env.BASE_URL}pnp-logo.jpg`}
              alt="Philippine National Police"
              className={cn("object-contain h-11 w-11", collapsed && "md:h-9 md:w-9")}
            />
          </div>
          <div className={cn("flex-1 min-w-0", collapsed && "md:hidden")}>
            <h1 className="font-bold text-lg leading-tight tracking-tight">{station?.stationShortName ?? "Police Station"}</h1>
            <p className="text-xs text-sidebar-foreground/70 uppercase font-semibold tracking-wider">Command Center</p>
          </div>
        </div>

        {/* Signed-in officer — quick access to their profile, above the nav */}
        <Link href="/profile" onClick={() => setIsMobileOpen(false)}>
          <div
            title={collapsed ? user.name : undefined}
            className={cn(
              "flex items-center gap-3 px-4 py-3 border-b border-sidebar-border transition-colors cursor-pointer",
              collapsed && "md:justify-center md:px-2",
              location === "/profile"
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "hover:bg-sidebar-accent/50"
            )}
          >
            <div className="h-9 w-9 rounded-full bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden">
              {user.avatarUrl
                ? <img src={`/api/storage${user.avatarUrl}`} alt={user.name} className="h-full w-full object-cover" />
                : user.name.charAt(0)}
            </div>
            <div className={cn("flex-1 min-w-0", collapsed && "md:hidden")}>
              <p className="text-sm font-semibold truncate">{user.name}</p>
              <p className="text-xs text-sidebar-foreground/60 capitalize">View profile · {user.rank}</p>
            </div>
          </div>
        </Link>

        <nav className={cn("flex-1 px-4 py-6 space-y-1 overflow-y-auto", collapsed && "md:px-2")}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} onClick={() => setIsMobileOpen(false)}>
                <div
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer",
                    collapsed && "md:justify-center md:px-2",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className={cn(collapsed && "md:hidden")}>{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        <div className={cn("p-4 border-t border-sidebar-border mt-auto", collapsed && "md:px-2")}>
          <Button
            variant="ghost"
            title={collapsed ? "Sign Out" : undefined}
            className={cn(
              "w-full text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              collapsed ? "md:justify-center md:px-2" : "justify-start"
            )}
            onClick={handleLogout}
            disabled={logout.isPending}
          >
            <LogOut className={cn("h-4 w-4 mr-2", collapsed && "md:mr-0")} />
            <span className={cn(collapsed && "md:hidden")}>{logout.isPending ? "Signing out..." : "Sign Out"}</span>
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
