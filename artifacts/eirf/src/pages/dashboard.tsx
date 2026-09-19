import React from "react";
import { Link } from "wouter";
import {
  useGetDashboardStats,
  useGetIncidentsByMonth,
  useGetIncidentsByType,
  useGetRecentIncidents
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { FileText, Clock, CheckCircle2, AlertTriangle, ArrowRight, Shield } from "lucide-react";
import { format, parseISO } from "date-fns";
import { getStatusColor, getStatusLabel } from "@/lib/incident-status";
import { cn } from "@/lib/utils";

const PIE_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: monthlyData, isLoading: monthLoading } = useGetIncidentsByMonth();
  const { data: typeData, isLoading: typeLoading } = useGetIncidentsByType();
  const { data: recentIncidents, isLoading: recentLoading } = useGetRecentIncidents();

  const isLoading = statsLoading || monthLoading || typeLoading || recentLoading;

  if (isLoading || !stats || !monthlyData || !typeData || !recentIncidents) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Command Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Card key={i} className="h-32 animate-pulse bg-muted" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 h-96 animate-pulse bg-muted" />
          <Card className="h-96 animate-pulse bg-muted" />
        </div>
      </div>
    );
  }

  const statCards = [
    { title: "Total Incidents", value: stats.totalIncidents, icon: FileText, color: "text-blue-500", bg: "bg-blue-100 dark:bg-blue-900/20" },
    { title: "Under Investigation", value: stats.underInvestigation, icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-100 dark:bg-amber-900/20" },
    { title: "Open Cases", value: stats.openIncidents, icon: Clock, color: "text-red-500", bg: "bg-red-100 dark:bg-red-900/20" },
    { title: "Closed Cases", value: stats.closedIncidents, icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-100 dark:bg-emerald-900/20" },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Command Dashboard</h1>
          <p className="text-muted-foreground mt-1">System overview and active operations</p>
        </div>
        <Button asChild>
          <Link href="/incidents/new">
            <Shield className="w-4 h-4 mr-2" />
            File New Incident
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <Card key={i} className="border-l-4 border-l-primary/60">
              <CardContent className="p-6 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground font-medium">{card.title}</p>
                  <p className="text-3xl font-bold font-mono">{card.value}</p>
                </div>
                <div className={`${card.bg} p-3 rounded-full`}>
                  <Icon className={`h-6 w-6 ${card.color}`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader>
            <CardTitle>Incidents by Month</CardTitle>
            <CardDescription>12-month rolling trend</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData}>
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <RechartsTooltip />
                <Bar dataKey="count" name="Incidents" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Incidents by Type</CardTitle>
            <CardDescription>Current distribution</CardDescription>
          </CardHeader>
          <CardContent>
            {typeData.length === 0 ? (
              <div className="flex items-center justify-center h-60 text-muted-foreground text-sm">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={typeData} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={80} label={({ type }) => type}>
                    {typeData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Incidents</CardTitle>
            <CardDescription>Latest filed records</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/incidents">
              View All <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {recentIncidents.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No incidents on record.</div>
          ) : (
            <div className="divide-y">
              {recentIncidents.map((incident) => (
                <Link key={incident.id} href={`/incidents/${incident.id}`}>
                  <div className="p-4 hover:bg-muted/30 transition-colors cursor-pointer flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-muted-foreground">{incident.incidentNumber}</span>
                        <Badge variant={getStatusColor(incident.status).variant} className={cn("text-xs", getStatusColor(incident.status).className)}>
                          {getStatusLabel(incident.status)}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium truncate">{incident.type} — {incident.location}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {incident.date} · {incident.reportingOfficerName || "Unknown Officer"}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
