import { Link, useRouter } from "@tanstack/react-router";
import { Home, PlusCircle, Trophy, Bell, Shield, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function BottomNav() {
  const { role, signOut } = useAuth();
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { count } = await supabase.from("notifications").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("read", false);
      setUnread(count ?? 0);
    };
    load();
    const ch = supabase.channel("notif-nav").on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const items = [
    { to: "/feed", icon: Home, label: "Feed" },
    { to: "/report", icon: PlusCircle, label: "Report", primary: true },
    { to: "/leaderboard", icon: Trophy, label: "Top" },
    { to: "/notifications", icon: Bell, label: "Alerts", badge: unread },
  ] as const;

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 border-t border-border bg-surface/95 backdrop-blur-lg">
      <div className="mx-auto flex max-w-md items-center justify-around px-2 py-2">
        {items.map((it) => {
          const active = router.state.location.pathname.startsWith(it.to);
          const Icon = it.icon;
          if ("primary" in it && it.primary) {
            return (
              <Link key={it.to} to={it.to} className="-mt-8 flex h-16 w-16 items-center justify-center rounded-full gradient-hero shadow-glow text-primary-foreground">
                <Icon className="h-7 w-7" />
              </Link>
            );
          }
          return (
            <Link key={it.to} to={it.to} className={`relative flex flex-col items-center gap-1 px-4 py-2 text-xs ${active ? "text-primary" : "text-muted-foreground"}`}>
              <Icon className="h-5 w-5" />
              <span>{it.label}</span>
              {"badge" in it && it.badge ? (
                <span className="absolute right-2 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">{it.badge}</span>
              ) : null}
            </Link>
          );
        })}
        {role === "admin" && (
          <Link to="/admin" className={`flex flex-col items-center gap-1 px-3 py-2 text-xs ${router.state.location.pathname.startsWith("/admin") ? "text-primary" : "text-muted-foreground"}`}>
            <Shield className="h-5 w-5" />
            <span>Admin</span>
          </Link>
        )}
        <button onClick={() => signOut()} className="flex flex-col items-center gap-1 px-3 py-2 text-xs text-muted-foreground">
          <LogOut className="h-5 w-5" />
          <span>Out</span>
        </button>
      </div>
    </nav>
  );
}
