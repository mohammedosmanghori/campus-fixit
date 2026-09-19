import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { categoryMeta, STATUS_META } from "@/lib/categories";
import { ArrowLeft, MapPin, User as UserIcon, Trash2, ThumbsUp } from "lucide-react";
import toast from "react-hot-toast";

export const Route = createFileRoute("/r/$id")({ component: ReportDetail });

function ReportDetail() {
  const { id } = Route.useParams();
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const [report, setReport] = useState<any>(null);
  const [reporter, setReporter] = useState<{ full_name: string | null; email: string } | null>(null);
  const [voteCount, setVoteCount] = useState(0);
  const [hasVoted, setHasVoted] = useState(false);

  const loadVotes = async () => {
    const { data } = await supabase.from("report_votes").select("user_id").eq("report_id", id);
    setVoteCount((data ?? []).length);
    setHasVoted((data ?? []).some(v => v.user_id === user?.id));
  };

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase.from("reports").select("*").eq("id", id).maybeSingle();
      setReport(data);
      if (data?.user_id) {
        const { data: p } = await supabase.from("profiles").select("full_name,email").eq("id", data.user_id).maybeSingle();
        setReporter(p);
      }
    };
    load();
    loadVotes();
    const ch = supabase.channel(`r-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "reports", filter: `id=eq.${id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "report_votes", filter: `report_id=eq.${id}` }, loadVotes)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, user]);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  if (!report) return <AppShell><p className="text-muted-foreground">Loading…</p></AppShell>;

  const cat = categoryMeta(report.category);
  const Icon = cat.icon;
  const status = STATUS_META[report.status as keyof typeof STATUS_META];
  const isOwner = report.user_id === user.id;
  const isAdmin = role === "admin";

  const setStatus = async (s: "pending" | "in_progress" | "fixed") => {
    const { error } = await supabase.from("reports").update({ status: s }).eq("id", id);
    if (error) toast.error(error.message); else toast.success("Status updated");
  };

  const remove = async () => {
    if (!confirm("Delete this report?")) return;
    const { error } = await supabase.from("reports").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); navigate({ to: "/feed" }); }
  };

  const toggleVote = async () => {
    if (isOwner) return;
    if (hasVoted) {
      await supabase.from("report_votes").delete().eq("report_id", id).eq("user_id", user.id);
    } else {
      const { error } = await supabase.from("report_votes").insert({ report_id: id, user_id: user.id });
      if (error && !error.message.includes("duplicate")) toast.error(error.message);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="mx-auto max-w-md">
        {report.video_url ? (
          <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface">
            <video src={report.video_url} controls playsInline className="h-full w-full object-cover" />
            <button onClick={() => navigate({ to: "/feed" })} className="absolute left-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-background/80 backdrop-blur">
              <ArrowLeft className="h-5 w-5" />
            </button>
          </div>
        ) : report.photo_url && (
          <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface">
            <img src={report.photo_url} alt={report.title} className="h-full w-full object-cover" />
            <button onClick={() => navigate({ to: "/feed" })} className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-background/80 backdrop-blur">
              <ArrowLeft className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="px-5 py-5">
          {!report.photo_url && (
            <button onClick={() => navigate({ to: "/feed" })} className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          )}
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: cat.color }}>
              <Icon className="h-5 w-5 text-background" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{cat.label}</span>
            <span className="ml-auto rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider" style={{ background: status.color, color: status.fg }}>
              {status.label}
            </span>
          </div>

          <h1 className="mt-4 text-2xl font-bold leading-tight">{report.title}</h1>
          {report.description && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{report.description}</p>}

          <div className="mt-5 space-y-2 rounded-2xl border border-border bg-surface p-4 text-sm">
            {report.location_name && (
              <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /><span>{report.location_name}</span></div>
            )}
            {reporter && (
              <div className="flex items-center gap-2"><UserIcon className="h-4 w-4 text-primary" /><span>{reporter.full_name ?? reporter.email}</span></div>
            )}
            <div className="text-xs text-muted-foreground">Reported {new Date(report.created_at).toLocaleString()}</div>
          </div>

          <button
            onClick={toggleVote}
            disabled={isOwner}
            className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold transition ${
              hasVoted ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-foreground"
            } disabled:opacity-50`}
          >
            <ThumbsUp className={`h-4 w-4 ${hasVoted ? "fill-current" : ""}`} />
            {isOwner ? `${voteCount + 1} reporter${voteCount ? "s" : ""}` : hasVoted ? `Joined · ${voteCount + 1}` : `Me too · ${voteCount + 1}`}
          </button>

          {isAdmin && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Update status</p>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(STATUS_META) as Array<keyof typeof STATUS_META>).map(s => (
                  <button key={s} onClick={() => setStatus(s)} className={`rounded-xl border px-3 py-2.5 text-xs font-semibold ${report.status === s ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-muted-foreground"}`}>
                    {STATUS_META[s].label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(isOwner || isAdmin) && (
            <button onClick={remove} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 py-3 text-sm font-medium text-destructive">
              <Trash2 className="h-4 w-4" /> Delete report
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
