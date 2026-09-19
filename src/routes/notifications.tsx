import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { Bell, CheckCheck } from "lucide-react";
import { motion } from "framer-motion";

export const Route = createFileRoute("/notifications")({ component: NotificationsPage });

interface Notif { id: string; title: string; message: string; read: boolean; created_at: string; report_id: string | null; }

function NotificationsPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<Notif[]>([]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
      setItems((data ?? []) as Notif[]);
    };
    load();
    const ch = supabase.channel("notif-page").on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const markAll = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
  };

  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;

  return (
    <AppShell title="Notifications">
      {items.some(i => !i.read) && (
        <button onClick={markAll} className="mb-4 flex items-center gap-2 text-xs font-medium text-primary">
          <CheckCheck className="h-4 w-4" /> Mark all read
        </button>
      )}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <Bell className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No notifications yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((n, i) => {
            const inner = (
              <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                className={`flex gap-3 rounded-2xl border p-4 ${n.read ? "border-border bg-surface" : "border-primary/40 bg-primary/5"}`}>
                <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-muted-foreground/30" : "bg-primary"}`} />
                <div className="flex-1">
                  <p className="text-sm font-semibold">{n.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground/70">{new Date(n.created_at).toLocaleString()}</p>
                </div>
              </motion.div>
            );
            return (
              <li key={n.id}>
                {n.report_id ? <Link to="/r/$id" params={{ id: n.report_id }}>{inner}</Link> : inner}
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
