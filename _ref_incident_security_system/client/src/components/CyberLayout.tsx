import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import {
  Activity,
  BarChart3,
  ChevronRight,
  FileText,
  LayoutDashboard,
  LogOut,
  Plus,
  Settings,
  Shield,
  ShieldAlert,
  User,
} from "lucide-react";
import { useLocation, Link } from "wouter";

interface CyberLayoutProps {
  children: React.ReactNode;
  breadcrumb?: string;
  title?: string;
}

const navSections = [
  {
    label: "Operações",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
      { label: "Novo Incidente", icon: Plus, href: "/incidents/new" },
      { label: "Incidentes", icon: FileText, href: "/incidents" },
    ],
  },
  {
    label: "Análise",
    items: [
      { label: "Análise de Risco", icon: BarChart3, href: "/risk" },
    ],
  },
];

export default function CyberLayout({ children, breadcrumb, title }: CyberLayoutProps) {
  const { user, isAuthenticated, loading, logout } = useAuth({ redirectOnUnauthenticated: true });
  const [location] = useLocation();

  if (loading) {
    return (
      <div className="soc-layout">
        <div className="soc-sidebar">
          <div className="soc-sidebar-logo">
            <div className="soc-sidebar-logo-icon">
              <Shield size={13} style={{ color: "oklch(0.82 0.20 155)" }} />
            </div>
            <div className="soc-sidebar-logo-text">
              <div className="soc-sidebar-logo-title">SOC Portal</div>
              <div className="soc-sidebar-logo-sub">Incident Response</div>
            </div>
          </div>
        </div>
        <div className="soc-main">
          <div className="soc-topbar" />
          <div className="soc-content" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div className="soc-spinner" />
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.href = getLoginUrl();
    return null;
  }

  const isAdmin = user?.role === "admin";
  const currentPage = title ?? breadcrumb ?? "Dashboard";

  return (
    <div className="soc-layout">
      {/* ── Sidebar ── */}
      <aside className="soc-sidebar">
        {/* Logo */}
        <div className="soc-sidebar-logo">
          <div className="soc-sidebar-logo-icon">
            <Shield size={13} style={{ color: "oklch(0.82 0.20 155)" }} />
          </div>
          <div className="soc-sidebar-logo-text">
            <div className="soc-sidebar-logo-title">SOC Portal</div>
            <div className="soc-sidebar-logo-sub">Incident Response</div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, overflowY: "auto" }}>
          {navSections.map((section) => (
            <div key={section.label} className="soc-nav-section">
              <div className="soc-nav-label">{section.label}</div>
              {section.items.map((item) => {
                const Icon = item.icon;
                const active =
                  location === item.href ||
                  (item.href !== "/dashboard" && location.startsWith(item.href));
                return (
                  <Link key={item.href} href={item.href}>
                    <div className={`soc-nav-item${active ? " active" : ""}`}>
                      <Icon size={14} />
                      <span>{item.label}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ))}

          {/* Admin */}
          {isAdmin && (
            <div className="soc-nav-section">
              <div className="soc-nav-label">Admin</div>
              <Link href="/admin">
                <div className={`soc-nav-item${location.startsWith("/admin") ? " active" : ""}`}>
                  <ShieldAlert size={14} />
                  <span>Administração</span>
                </div>
              </Link>
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className="soc-sidebar-footer">
          {user && (
            <div style={{
              display: "flex", alignItems: "center", gap: "0.5rem",
              padding: "0.375rem 0.25rem", marginBottom: "0.375rem",
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%",
                background: "oklch(0.15 0.04 155)",
                border: "1px solid oklch(0.82 0.20 155 / 0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <User size={11} style={{ color: "oklch(0.82 0.20 155)" }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: "0.74rem", fontWeight: 500,
                  color: "oklch(0.75 0.008 240)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {user.name ?? user.email ?? "Usuário"}
                </div>
                {isAdmin && (
                  <div style={{ fontSize: "0.62rem", color: "oklch(0.82 0.20 155)" }}>
                    Administrador
                  </div>
                )}
              </div>
            </div>
          )}
          <button onClick={logout} className="soc-nav-item" style={{ width: "100%" }}>
            <LogOut size={13} />
            <span>Sair</span>
          </button>
          <div style={{
            marginTop: "0.5rem", fontSize: "0.6rem",
            color: "oklch(0.30 0.008 240)", textAlign: "center",
          }}>
            ● Sistema Ativo
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="soc-main">
        {/* Top bar */}
        <div className="soc-topbar">
          <div className="soc-breadcrumb">
            <span>SOC</span>
            <ChevronRight size={10} className="soc-breadcrumb-sep" />
            <span className="soc-breadcrumb-active" style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {currentPage}
            </span>
          </div>
          <div className="soc-live-indicator">
            <div className="soc-live-dot" />
            LIVE
          </div>
        </div>

        {/* Content */}
        <main className="soc-content soc-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
