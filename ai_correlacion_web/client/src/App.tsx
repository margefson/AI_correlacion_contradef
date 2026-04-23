import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { Toaster } from "./components/ui/sonner";
import { ThemeProvider } from "./contexts/ThemeContext";
import ComponentsShowcase from "./pages/ComponentShowcase";
import Home from "./pages/Home";
import ReduceLogs from "./pages/ReduceLogs";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/reduce-logs" component={ReduceLogs} />
      <Route path="/component-showcase" component={ComponentsShowcase} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
