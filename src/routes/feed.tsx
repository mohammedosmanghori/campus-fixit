import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { categoryMeta, STATUS_META } from "@/lib/categories";
import { motion } from "framer-motion";
import { MapPin } from "lucide-react";

export const Route = createFileRoute("/feed")({ component: Feed });

interface Report {
  id: string; title: string; description: string | null; category: string; status: keyof typeof STATUS_META;
  photo_url: string | null; location_name: string | null; created_at: string; user_id: string;
}

function Feed() {
  const { user, loading } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState<"all" | "mine">("all");

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      let q = supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(50);
      if (filter === "mine") q = q.eq("user_id", user.id);
      const { data } = await q;
      setReports((data ?? []) as Report[]);
    };
    load();
    const ch = supabase.channel("reports-feed").on("postgres_changes", { event: "*", schema: "public", table: "reports" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, filter]);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;

  return (
    <AppShell title="Campus Feed">
      <div className="mb-4 flex gap-2">
        {(["all", "mine"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${filter === f ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground"}`}>
            {f === "all" ? "All reports" : "My reports"}
          </button>
        ))}
      </div>

      {reports.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No reports yet. Tap the big button to file the first one.
        </div>
      ) : (
        <ul className="space-y-3">
          {reports.map((r, i) => {
            const cat = categoryMeta(r.category);
            const Icon = cat.icon;
            const status = STATUS_META[r.status];
            return (
              <motion.li key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <Link to="/r/$id" params={{ id: r.id }} className="block overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
                  {r.photo_url && (
                    <div className="aspect-[16/10] w-full overflow-hidden bg-background">
                      <img src={r.photo_url} alt={r.title} className="h-full w-full object-cover" />
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: cat.color, opacity: 0.9 }}>
                          <Icon className="h-4 w-4 text-background" />
                        </div>
                        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{cat.label}</span>
                      </div>
                      <span className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider" style={{ background: status.color, color: status.fg }}>
                        {status.label}
                      </span>
                    </div>
                    <h3 className="mt-3 text-base font-semibold leading-snug">{r.title}</h3>
                    {r.location_name && (
                      <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" /> {r.location_name}
                      </p>
                    )}
                  </div>
                </Link>
              </motion.li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
