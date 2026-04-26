import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Incidents from "./pages/Incidents";
import NewIncident from "./pages/NewIncident";
import IncidentDetail from "./pages/IncidentDetail";
import RiskAnalysis from "./pages/RiskAnalysis";
import Admin from "./pages/Admin";
import AdminCategories from "./pages/AdminCategories";
import AdminML from "./pages/AdminML";
import AdminUsers from "./pages/AdminUsers";
import AdminSystemHealth from "./pages/AdminSystemHealth";
import AdminIncidents from "./pages/AdminIncidents";
import AdminMLTraining from "./pages/AdminMLTraining";
import Profile from "./pages/Profile";
import ResetPassword from "./pages/ResetPassword";
import ResolutionMetrics from "./pages/ResolutionMetrics";
import AnalystIncidents from "./pages/AnalystIncidents";
import AnalystDashboard from "./pages/AnalystDashboard";
function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/register" component={Register} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/incidents/new" component={NewIncident} />
      <Route path="/incidents/:id" component={IncidentDetail} />
      <Route path="/incidents" component={Incidents} />
      <Route path="/risk" component={RiskAnalysis} />
      <Route path="/admin" component={Admin} />
      <Route path="/admin/categories" component={AdminCategories} />
      <Route path="/admin/ml" component={AdminML} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/system-health" component={AdminSystemHealth} />
      <Route path="/admin/incidents" component={AdminIncidents} />
      <Route path="/admin/ml-training" component={AdminMLTraining} />
      <Route path="/profile" component={Profile} />
      <Route path="/metrics" component={ResolutionMetrics} />
      <Route path="/analyst/incidents" component={AnalystIncidents} />
      <Route path="/analyst/dashboard" component={AnalystDashboard} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster theme="dark" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
