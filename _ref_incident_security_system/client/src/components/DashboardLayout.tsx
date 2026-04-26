import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  LayoutDashboard, AlertTriangle, PlusCircle, BarChart2, TrendingUp,
  Shield, ShieldAlert, LogOut, User, Tag, ChevronRight, Brain, Users, Activity, List, MonitorPlay
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarHeader,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import DashboardLayoutSkeleton from "./DashboardLayoutSkeleton";
import NotificationBell from "./NotificationBell";

const menuItems = [
  { path: "/dashboard",    label: "Dashboard",    icon: LayoutDashboard },
  { path: "/incidents",    label: "Incidentes",   icon: AlertTriangle },
  { path: "/incidents/new",label: "Novo Incidente",icon: PlusCircle },
  { path: "/risk",         label: "Análise de Risco", icon: BarChart2 },
  { path: "/metrics",      label: "Métricas de Resolução", icon: TrendingUp },
];

const adminItems = [
  { path: "/admin",            label: "Painel Admin",  icon: ShieldAlert },
  { path: "/admin/categories", label: "Categorias",    icon: Tag },
  { path: "/admin/ml",         label: "Machine Learning", icon: Brain },
  { path: "/admin/users",       label: "Usuários",         icon: Users },
  { path: "/admin/incidents",    label: "Todos Incidentes",  icon: List },
  { path: "/admin/system-health",label: "Saúde do Sistema",  icon: Activity },
  { path: "/admin/ml-training",   label: "Treinamento ao Vivo", icon: MonitorPlay },
];
const analystItems = [
  { path: "/analyst/dashboard", label: "Dashboard Analista", icon: BarChart2 },
  { path: "/analyst/incidents", label: "Todos Incidentes", icon: List },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user, loading } = useAuth();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => { toast.success("Sessão encerrada."); window.location.href = "/login"; },
  });

  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) { window.location.href = "/login"; return null; }

  const activeItem = [...menuItems, ...adminItems, ...analystItems].find(
    (i) => location === i.path || (i.path !== "/dashboard" && location.startsWith(i.path))
  );

  return (
    <SidebarProvider>
      <Sidebar variant="sidebar" collapsible="icon">
        <SidebarHeader className="p-3 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 shrink-0">
              <Shield className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm font-mono text-foreground truncate">Incident Sec</p>
              <p className="text-xs text-muted-foreground font-mono truncate">Security System</p>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent className="gap-0 py-2">
          <SidebarMenu className="px-2">
            {menuItems.map(item => {
              const isActive = location === item.path || (item.path !== "/dashboard" && location.startsWith(item.path));
              return (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    isActive={isActive}
                    onClick={() => setLocation(item.path)}
                    tooltip={item.label}
                    className="h-9 transition-all font-mono text-xs"
                  >
                    <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={isActive ? "text-foreground font-medium" : "text-muted-foreground"}>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
          {user.role === "admin" && (
            <>
              <div className="px-4 pt-3 pb-1">
                <p className="text-xs font-mono text-muted-foreground/50 uppercase tracking-wider">Admin</p>
              </div>
              <SidebarMenu className="px-2">
                {adminItems.map(item => {
                  const isActive = location === item.path || (item.path !== "/admin" && location.startsWith(item.path));
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => setLocation(item.path)}
                        tooltip={item.label}
                        className="h-9 transition-all font-mono text-xs"
                      >
                        <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                        <span className={isActive ? "text-foreground font-medium" : "text-muted-foreground"}>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </>
          )}
          {user.role === "security-analyst" && (
            <>
              <div className="px-4 pt-3 pb-1">
                <p className="text-xs font-mono text-muted-foreground/50 uppercase tracking-wider">Analista</p>
              </div>
              <SidebarMenu className="px-2">
                {analystItems.map(item => {
                  const isActive = location === item.path || location.startsWith(item.path);
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => setLocation(item.path)}
                        tooltip={item.label}
                        className="h-9 transition-all font-mono text-xs"
                      >
                        <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                        <span className={isActive ? "text-foreground font-medium" : "text-muted-foreground"}>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </>
          )}
        </SidebarContent>
        <SidebarFooter className="p-3 border-t border-sidebar-border/50">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left focus:outline-none">
                <Avatar className="h-8 w-8 border border-border shrink-0">
                  <AvatarFallback className="text-xs font-mono bg-primary/10 text-primary">
                    {user?.name?.charAt(0).toUpperCase() ?? "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono font-medium truncate text-foreground">{user?.name || "Usuário"}</p>
                  <p className="text-xs text-muted-foreground truncate font-mono">
                    {user?.role === "admin" ? "Administrador" : user?.role === "security-analyst" ? "Security Analyst" : "Usuário"}
                  </p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-card border-border">
              <DropdownMenuItem onClick={() => setLocation("/profile")} className="cursor-pointer font-mono text-xs">
                <User className="mr-2 h-3.5 w-3.5" /> Meu Perfil
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => logoutMutation.mutate()} className="cursor-pointer text-destructive focus:text-destructive font-mono text-xs">
                <LogOut className="mr-2 h-3.5 w-3.5" /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="bg-background">
        <div className="flex border-b border-border h-12 items-center justify-between bg-background/95 px-4 backdrop-blur sticky top-0 z-40">
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <Shield className="w-3.5 h-3.5 text-primary" />
            <span className="text-muted-foreground/50">ISS</span>
            <ChevronRight className="w-3 h-3 text-muted-foreground/30" />
            <span className="text-foreground font-medium">{activeItem?.label ?? "Dashboard"}</span>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <div className="flex items-center gap-1.5 text-xs font-mono text-primary">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              LIVE
            </div>
          </div>
        </div>
        <main className="flex-1 p-5 max-w-screen-2xl">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
