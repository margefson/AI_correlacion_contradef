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
import { BrainCircuit, FileArchive, LayoutDashboard, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { createContext, CSSProperties, useContext, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: BrainCircuit, label: "Interpretação Consolidada", path: "/interpretacao-consolidada" },
  { icon: FileArchive, label: "Reduzir Logs", path: "/reduce-logs" },
];

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
  const activeMenuItem = menuItems.find(item => item.path === location);
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

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {menuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-10 transition-all font-normal`}
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
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
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
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
              <p className="truncate text-sm font-medium text-foreground">
                {activeMenuItem?.label ?? APP_NAME}
              </p>
              {!isMobile ? (
                <p className="truncate text-xs text-muted-foreground">
                  {isCollapsed ? "Menu recolhido — área principal alargada" : "Área principal · recolha o menu para mais espaço (ex.: grafo)"}
                </p>
              ) : null}
            </div>
          </div>
          <ThemeToggle />
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
