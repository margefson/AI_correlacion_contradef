import { useAuth } from "@/_core/hooks/useAuth";
import { DashboardLayoutSkeleton } from "@/components/DashboardLayoutSkeleton";
import HomeDashboard from "./HomeDashboard";
import LandingPage from "./LandingPage";

/**
 * `/` — landing pública (estilo referência) quando não há sessão; dashboard autenticado caso contrário.
 * Com AUTH_MODE=none o backend devolve sempre um utilizador de bypass, logo o dashboard é mostrado.
 */
export default function Home() {
  const { user, loading } = useAuth();

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return <LandingPage />;
  }

  return <HomeDashboard />;
}
