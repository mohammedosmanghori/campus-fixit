import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { Trophy, Medal, Award } from "lucide-react";
import { motion } from "framer-motion";

export const Route = createFileRoute("/leaderboard")({ component: Leaderboard });

interface Entry { user_id: string; full_name: string | null; email: string; count: number; }

function Leaderboard() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<Entry[]>([]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const start = new Date();
      start.setDate(1); start.setHours(0, 0, 0, 0);
      const { data: reports } = await supabase.from("reports").select("user_id").gte("created_at", start.toISOString());
      const counts = new Map<string, number>();
      (reports ?? []).forEach(r => counts.set(r.user_id, (counts.get(r.user_id) ?? 0) + 1));
      const ids = [...counts.keys()];
      if (ids.length === 0) { setRows([]); return; }
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      const merged: Entry[] = (profiles ?? []).map(p => ({ user_id: p.id, full_name: p.full_name, email: p.email, count: counts.get(p.id) ?? 0 }));
      merged.sort((a, b) => b.count - a.count);
      setRows(merged.slice(0, 20));
    };
    load();
  }, [user]);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;

  const monthName = new Date().toLocaleString(undefined, { month: "long" });
  const trophies = [
    { Icon: Trophy, color: "oklch(0.82 0.17 75)" },
    { Icon: Medal, color: "oklch(0.75 0.05 80)" },
    { Icon: Award, color: "oklch(0.6 0.12 30)" },
  ];

  return (
    <AppShell title="Top Reporters">
      <p className="mb-4 text-sm text-muted-foreground">Most reports filed in {monthName}.</p>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nothing here yet — be the first to file a report this month.
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r, i) => {
            const t = trophies[i];
            return (
              <motion.li key={r.user_id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                className={`flex items-center gap-3 rounded-2xl border p-3 ${r.user_id === user.id ? "border-primary bg-primary/10" : "border-border bg-surface"}`}>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl text-lg font-bold" style={{ background: t ? `${t.color}30` : "var(--color-muted)", color: t?.color ?? "var(--color-muted-foreground)" }}>
                  {t ? <t.Icon className="h-5 w-5" /> : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-semibold">{r.full_name ?? r.email.split("@")[0]}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.email}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-primary">{r.count}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">reports</p>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
