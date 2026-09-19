import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { categoryMeta, STATUS_META } from "@/lib/categories";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { MapPin, List, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/admin")({ component: Admin });

interface R { id: string; title: string; category: string; status: keyof typeof STATUS_META; latitude: number | null; longitude: number | null; location_name: string | null; created_at: string; user_id: string; }

function Admin() {
  const { user, role, loading } = useAuth();
  const [reports, setReports] = useState<R[]>([]);
  const [view, setView] = useState<"list" | "map">("list");
  const [statusFilter, setStatusFilter] = useState<"all" | keyof typeof STATUS_META>("all");

  useEffect(() => {
    if (role !== "admin") return;
    const load = async () => {
      const { data } = await supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(200);
      setReports((data ?? []) as R[]);
    };
    load();
    const ch = supabase.channel("admin-reports").on("postgres_changes", { event: "*", schema: "public", table: "reports" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [role]);

  const filtered = useMemo(() => statusFilter === "all" ? reports : reports.filter(r => r.status === statusFilter), [reports, statusFilter]);
  const stats = useMemo(() => ({
    pending: reports.filter(r => r.status === "pending").length,
    in_progress: reports.filter(r => r.status === "in_progress").length,
    fixed: reports.filter(r => r.status === "fixed").length,
  }), [reports]);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  if (role && role !== "admin") {
    return (
      <AppShell title="Admin">
        <div className="rounded-2xl border border-warning/40 bg-warning/10 p-6 text-center">
          <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-warning" />
          <p className="text-sm font-semibold">Admin only</p>
          <p className="mt-1 text-xs text-muted-foreground">An existing admin can grant your account the admin role from the database.</p>
        </div>
      </AppShell>
    );
  }

  const setStatus = async (id: string, s: keyof typeof STATUS_META) => {
    const { error } = await supabase.from("reports").update({ status: s }).eq("id", id);
    if (error) toast.error(error.message); else toast.success("Updated");
  };

  return (
    <AppShell title="Admin Dashboard">
      <div className="grid grid-cols-3 gap-2">
        {(["pending", "in_progress", "fixed"] as const).map(k => (
          <button key={k} onClick={() => setStatusFilter(statusFilter === k ? "all" : k)}
            className={`rounded-2xl border p-3 text-left transition ${statusFilter === k ? "border-primary bg-primary/10" : "border-border bg-surface"}`}>
            <p className="text-2xl font-bold" style={{ color: STATUS_META[k].color }}>{stats[k]}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{STATUS_META[k].label}</p>
          </button>
        ))}
      </div>

      <div className="mt-5 flex gap-2">
        <button onClick={() => setView("list")} className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium ${view === "list" ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground"}`}>
          <List className="h-4 w-4" /> List
        </button>
        <button onClick={() => setView("map")} className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium ${view === "map" ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground"}`}>
          <MapPin className="h-4 w-4" /> Map
        </button>
      </div>

      {view === "map" ? <MapView reports={filtered} /> : (
        <ul className="mt-4 space-y-2">
          {filtered.map((r, i) => {
            const cat = categoryMeta(r.category);
            const Icon = cat.icon;
            return (
              <motion.li key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                className="rounded-2xl border border-border bg-surface p-3">
                <Link to="/r/$id" params={{ id: r.id }} className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: cat.color }}>
                    <Icon className="h-4 w-4 text-background" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{r.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.location_name ?? "No location"}</p>
                  </div>
                </Link>
                <div className="mt-3 flex gap-1.5">
                  {(Object.keys(STATUS_META) as Array<keyof typeof STATUS_META>).map(s => (
                    <button key={s} onClick={() => setStatus(r.id, s)}
                      className={`flex-1 rounded-lg py-1.5 text-[11px] font-bold uppercase tracking-wider transition ${r.status === s ? "" : "bg-background text-muted-foreground"}`}
                      style={r.status === s ? { background: STATUS_META[s].color, color: STATUS_META[s].fg } : {}}>
                      {STATUS_META[s].label}
                    </button>
                  ))}
                </div>
              </motion.li>
            );
          })}
          {filtered.length === 0 && (
            <li className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No reports here.</li>
          )}
        </ul>
      )}
    </AppShell>
  );
}

function MapView({ reports }: { reports: R[] }) {
  const withCoords = reports.filter(r => r.latitude != null && r.longitude != null);
  if (withCoords.length === 0) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        No reports with GPS coordinates yet.
      </div>
    );
  }
  const lats = withCoords.map(r => r.latitude!);
  const lngs = withCoords.map(r => r.longitude!);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const padLat = (maxLat - minLat) * 0.15 || 0.001;
  const padLng = (maxLng - minLng) * 0.15 || 0.001;
  const project = (lat: number, lng: number) => ({
    x: ((lng - (minLng - padLng)) / ((maxLng + padLng) - (minLng - padLng))) * 100,
    y: 100 - ((lat - (minLat - padLat)) / ((maxLat + padLat) - (minLat - padLat))) * 100,
  });

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="relative aspect-square w-full bg-[radial-gradient(circle_at_50%_50%,oklch(0.27_0.03_260)_0%,oklch(0.18_0.02_260)_70%)]">
        <svg className="absolute inset-0 h-full w-full opacity-20" viewBox="0 0 100 100" preserveAspectRatio="none">
          {Array.from({ length: 11 }).map((_, i) => (
            <g key={i}>
              <line x1={i * 10} y1="0" x2={i * 10} y2="100" stroke="oklch(0.32 0.025 260)" strokeWidth="0.2" />
              <line x1="0" y1={i * 10} x2="100" y2={i * 10} stroke="oklch(0.32 0.025 260)" strokeWidth="0.2" />
            </g>
          ))}
        </svg>
        {withCoords.map(r => {
          const p = project(r.latitude!, r.longitude!);
          const status = STATUS_META[r.status];
          return (
            <Link key={r.id} to="/r/$id" params={{ id: r.id }}
              className="absolute -translate-x-1/2 -translate-y-full"
              style={{ left: `${p.x}%`, top: `${p.y}%` }}>
              <div className="flex flex-col items-center">
                <div className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase shadow-lg" style={{ background: status.color, color: status.fg }}>
                  {categoryMeta(r.category).label}
                </div>
                <div className="-mt-0.5 h-3 w-3 rotate-45 shadow-lg" style={{ background: status.color }} />
              </div>
            </Link>
          );
        })}
      </div>
      <div className="border-t border-border p-3 text-center text-[11px] text-muted-foreground">
        {withCoords.length} pin{withCoords.length === 1 ? "" : "s"} · scaled to plotted reports
      </div>
    </div>
  );
}
