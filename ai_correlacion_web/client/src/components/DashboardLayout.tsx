import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { APP_NAME, appDocumentTitle } from "@/lib/brand";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  Bell,
  BrainCircuit,
  FileArchive,
  LayoutDashboard,
  LogOut,
  User,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createContext, CSSProperties, useContext, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";

const mainMenuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: BrainCircuit, label: "Interpretação consolidada", path: "/interpretacao-consolidada" },
  { icon: FileArchive, label: "Reduzir logs", path: "/reduce-logs" },
];

const accountMenuItem = { icon: User, label: "Meu perfil", path: "/perfil" as const };
const adminMenuItem = { icon: Users, label: "Usuários", path: "/admin/usuarios" as const };

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

type DashboardShellValue = {
  /** Menu lateral em modo recolhido (offcanvas): mais largura útil para gráficos e tabelas. */
  sidebarCollapsed: boolean;
};

const DashboardShellContext = createContext<DashboardShellValue>({ sidebarCollapsed: false });

/** Só fiável em componentes renderizados *como filhos* de `<DashboardLayout>` (não no mesmo ficheiro que o envolve por fora). */
export function useDashboardShell() {
  return useContext(DashboardShellContext);
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
              <h1 className="text-2xl font-semibold tracking-tight text-center">
                Acesse a plataforma para continuar
              </h1>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                Este painel exige autenticação para proteger os dados analíticos e os artefatos gerados pela investigação.
              </p>

          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            Entrar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const allNavItems = [
    ...mainMenuItems,
    ...(user?.role === "admin" ? [accountMenuItem] : []),
    ...(user?.role === "admin" ? [adminMenuItem] : []),
  ];
  /** Utilizadores normais acedem a /perfil só pelo menu do rodapé; `allNavItems` não inclui essa rota para eles. */
  const activeMenuItem =
    allNavItems.find(item => item.path === location) ??
    (location === "/perfil" ? accountMenuItem : undefined);
  const isMobile = useIsMobile();

  useEffect(() => {
    document.title = appDocumentTitle(activeMenuItem?.label);
  }, [activeMenuItem?.label]);

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <DashboardShellContext.Provider value={{ sidebarCollapsed: isCollapsed }}>
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="offcanvas"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex w-full items-center gap-3 px-2 transition-all">
              <SidebarTrigger
                className="h-8 w-8 shrink-0"
                title="Recolher ou expandir menu"
              />
              {!isCollapsed ? (
                <div className="flex min-w-0 items-center gap-2.5">
                  <img
                    src="/favicon.svg"
                    alt=""
                    width={28}
                    height={28}
                    className="h-7 w-7 shrink-0 rounded-lg"
                  />
                  <span className="truncate font-semibold tracking-tight">
                    {APP_NAME}
                  </span>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-2">
            <SidebarGroup>
              <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/80">
                Principal
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="px-0 py-0">
                  {mainMenuItems.map(item => {
                    const isActive = location === item.path;
                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => setLocation(item.path)}
                          tooltip={item.label}
                          className="h-10 transition-all font-normal"
                        >
                          <item.icon
                            className={`h-4 w-4 ${isActive ? "text-[var(--auth-brand)]" : ""}`}
                          />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {user?.role === "admin" ? (
              <SidebarGroup>
                <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/80">
                  Conta
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="px-0 py-0">
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        isActive={location === accountMenuItem.path}
                        onClick={() => setLocation(accountMenuItem.path)}
                        tooltip={accountMenuItem.label}
                        className="h-10 transition-all font-normal"
                      >
                        <accountMenuItem.icon
                          className={`h-4 w-4 ${
                            location === accountMenuItem.path ? "text-[var(--auth-brand)]" : ""
                          }`}
                        />
                        <span>{accountMenuItem.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ) : null}

            {user?.role === "admin" ? (
              <SidebarGroup>
                <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-amber-500/80">
                  Administração
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="px-0 py-0">
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        isActive={location === adminMenuItem.path}
                        onClick={() => setLocation(adminMenuItem.path)}
                        tooltip={adminMenuItem.label}
                        className="h-10 transition-all font-normal"
                      >
                        <adminMenuItem.icon
                          className={`h-4 w-4 ${
                            location === adminMenuItem.path ? "text-[var(--auth-brand)]" : ""
                          }`}
                        />
                        <span>{adminMenuItem.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ) : null}
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-semibold truncate leading-none text-foreground">
                      {user?.name || "—"}
                    </p>
                    <p className="text-xs font-medium truncate mt-1.5 text-[var(--auth-brand)]">
                      {user?.role === "admin" ? "Administrador" : "Usuário"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 border-border/80 bg-popover/95">
                <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => setLocation("/perfil")}>
                  <User className="h-4 w-4" />
                  <span>Meu Perfil</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset className="min-h-svh min-w-0 overflow-x-hidden">
        <header
          className={cn(
            "sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:backdrop-blur",
            isCollapsed ? "px-2 sm:px-3" : "px-3 md:px-4",
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <SidebarTrigger
              className="h-9 w-9 shrink-0"
              title={isMobile ? "Abrir menu" : "Mostrar menu lateral"}
            />
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/90">
                {APP_NAME} / {activeMenuItem?.label ?? "Início"}
              </p>
              <p className="truncate text-sm font-medium text-foreground">
                {activeMenuItem?.label ?? APP_NAME}
              </p>
              {!isMobile ? (
                <p className="truncate text-xs text-muted-foreground">
                  {isCollapsed
                    ? "Menu recolhido — área principal alargada"
                    : "Área principal · recolha o menu para mais espaço (ex.: grafo)"}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground"
              disabled
              title="Notificações (em breve)"
            >
              <Bell className="h-4 w-4" />
            </Button>
            <div className="hidden sm:flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-xs font-semibold text-[var(--auth-brand)]">
              {(user?.name ?? user?.email ?? "?")
                .split(/\s+/)
                .map(s => s[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <ThemeToggle />
          </div>
        </header>
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-auto transition-[padding] duration-200",
            /* Menu recolhido: sem padding horizontal — aproveita toda a largura (gráficos, tabelas). */
            isCollapsed ? "px-0 py-2 md:py-3" : "p-4",
          )}
        >
          <div
            className={cn(
              "w-full min-w-0",
              isCollapsed ? "max-w-none" : "mx-auto max-w-[1680px]",
            )}
          >
            {children}
          </div>
        </div>
      </SidebarInset>
    </>
    </DashboardShellContext.Provider>
  );
}
