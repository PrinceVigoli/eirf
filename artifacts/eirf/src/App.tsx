import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { Layout } from "./components/layout";
import Login from "./pages/login";
import Dashboard from "./pages/dashboard";
import IncidentList from "./pages/incidents/index";
import NewIncident from "./pages/incidents/new";
import IncidentDetail from "./pages/incidents/detail";
import EditIncident from "./pages/incidents/edit";
import PersonList from "./pages/persons/index";
import NewPerson from "./pages/persons/new";
import PersonDetail from "./pages/persons/detail";
import EditPerson from "./pages/persons/edit";
import OfficerList from "./pages/officers/index";
import NewOfficer from "./pages/officers/new";
import EditOfficer from "./pages/officers/edit";
import LogsList from "./pages/logs/index";
import Reports from "./pages/reports/index";
import Profile from "./pages/profile";
import SystemPage from "./pages/system";
import { OfflineBanner } from "./components/offline-banner";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      gcTime: 1000 * 60 * 10,
      retry: (failureCount, error: any) => {
        // Don't retry on 4xx errors
        if (error?.status >= 400 && error?.status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

const NotFound = () => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
    <h1 className="text-4xl font-bold font-mono text-primary mb-2">404</h1>
    <h2 className="text-xl font-semibold mb-4">Record Not Found</h2>
    <p className="text-muted-foreground max-w-md">The requested resource could not be located in the system. It may have been archived or removed.</p>
  </div>
);

function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { data: user, isLoading } = useGetMe({ query: { retry: false, queryKey: getGetMeQueryKey() } });
  if (isLoading) return null;
  if (!user || user.role !== "admin") return <Redirect to="/" />;
  return <Component />;
}

function ProtectedApp() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/incidents/new" component={NewIncident} />
        <Route path="/incidents/:id/edit" component={EditIncident} />
        <Route path="/incidents/:id" component={IncidentDetail} />
        <Route path="/incidents" component={IncidentList} />
        <Route path="/persons/new" component={NewPerson} />
        <Route path="/persons/:id/edit" component={EditPerson} />
        <Route path="/persons/:id" component={PersonDetail} />
        <Route path="/persons" component={PersonList} />
        <Route path="/reports" component={Reports} />
        <Route path="/officers/new">{() => <AdminRoute component={NewOfficer} />}</Route>
        <Route path="/officers/:id/edit">{() => <AdminRoute component={EditOfficer} />}</Route>
        <Route path="/officers">{() => <AdminRoute component={OfficerList} />}</Route>
        <Route path="/logs">{() => <AdminRoute component={LogsList} />}</Route>
        <Route path="/system">{() => <AdminRoute component={SystemPage} />}</Route>
        <Route path="/profile" component={Profile} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/.*" component={ProtectedApp} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <OfflineBanner />
        <Router />
      </WouterRouter>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
