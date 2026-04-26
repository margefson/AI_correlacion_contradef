import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Bell, X, CheckCheck, AlertTriangle, RefreshCw, Info } from "lucide-react";
import { useLocation } from "wouter";

const TYPE_CONFIG = {
  reclassification: { icon: RefreshCw, color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/20", label: "Reclassificação" },
  status_changed:   { icon: AlertTriangle, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", label: "Status alterado" },
  risk_changed:     { icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20", label: "Risco alterado" },
  system:           { icon: Info, color: "text-muted-foreground", bg: "bg-muted/30", border: "border-border", label: "Sistema" },
};

function timeAgo(date: Date | string) {
  const d = new Date(date);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: count = 0 } = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 30000, // poll every 30s
  });
  const { data: notifications = [] } = trpc.notifications.list.useQuery(undefined, {
    enabled: open,
  });

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
  });
  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
  });

  const handleNotificationClick = (notif: typeof notifications[0]) => {
    if (!notif.isRead) {
      markRead.mutate({ id: notif.id });
    }
    if (notif.incidentId) {
      navigate(`/incidents/${notif.incidentId}`);
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted/50 transition-colors"
        title="Notificações"
      >
        <Bell className="w-4 h-4 text-muted-foreground" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Panel */}
          <div className="absolute right-0 top-10 z-50 w-80 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-foreground" />
                <span className="text-sm font-mono font-semibold text-foreground">Notificações</span>
                {count > 0 && (
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                    {count} nova{count !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {count > 0 && (
                  <button
                    onClick={() => markAllRead.mutate()}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted/50"
                    title="Marcar todas como lidas"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted/50 transition-colors">
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <Bell className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm font-mono">Nenhuma notificação</p>
                </div>
              ) : (
                notifications.map((notif) => {
                  const cfg = TYPE_CONFIG[notif.type as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG.system;
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif)}
                      className={`flex items-start gap-3 px-4 py-3 border-b border-border/50 cursor-pointer transition-colors ${
                        notif.isRead ? "opacity-60 hover:bg-muted/20" : "hover:bg-muted/30"
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${cfg.bg} border ${cfg.border}`}>
                        <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-mono font-semibold text-foreground leading-tight">{notif.title}</p>
                          {!notif.isRead && (
                            <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-0.5" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{notif.message}</p>
                        <p className="text-[10px] text-muted-foreground/60 font-mono mt-1">{timeAgo(notif.createdAt)}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
