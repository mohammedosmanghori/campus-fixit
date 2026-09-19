import { createFileRoute, useNavigate, Navigate, Link } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { CATEGORIES, categoryMeta } from "@/lib/categories";
import { analyzeReport, type AnalyzeResult } from "@/lib/analyze-report.functions";
import toast from "react-hot-toast";
import { Camera, MapPin, Loader2, Sparkles, RotateCcw, Video, AlertTriangle, ThumbsUp, Image as ImageIcon, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/report")({ component: ReportPage });

type MediaKind = "photo" | "video";
const NEARBY_METERS = 75;

interface ExistingReport {
  id: string; title: string; category: string; status: string;
  photo_url: string | null; location_name: string | null;
  latitude: number | null; longitude: number | null; created_at: string;
  vote_count: number;
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

function ReportPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const analyze = useServerFn(analyzeReport);

  const [mediaKind, setMediaKind] = useState<MediaKind>("photo");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);

  const [location, setLocation] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const [duplicates, setDuplicates] = useState<ExistingReport[] | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [camBusy, setCamBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoElRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);


  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;

  const reset = () => {
    setMediaFile(null); setMediaPreview(null); setPhotoUrl(null); setVideoUrl(null);
    setAnalysis(null); setDuplicates(null);
  };

  const switchKind = (k: MediaKind) => { if (k === mediaKind) return; setMediaKind(k); reset(); };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  const closeCamera = () => {
    try { recorderRef.current?.state === "recording" && recorderRef.current.stop(); } catch { /* ignore */ }
    recorderRef.current = null;
    setRecording(false);
    stopStream();
    setCameraOpen(false);
  };

  const openCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Live camera isn't supported here — use 'From gallery'.");
      return;
    }
    // Heads-up if the user previously denied camera access, so they know to fix it in settings.
    try {
      const nav = navigator as Navigator & { permissions?: { query: (d: { name: string }) => Promise<{ state: string }> } };
      const status = await nav.permissions?.query({ name: "camera" });
      if (status?.state === "denied") {
        toast.error("Camera permission is blocked. Allow camera access for this site in your browser settings, then tap again.");
        return;
      }
    } catch { /* permissions API unavailable — getUserMedia will prompt anyway */ }
    setCamBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: mediaKind === "video",
      });
      streamRef.current = stream;
      setCameraOpen(true);
      // attach after the overlay renders (effect below also re-attaches)
      requestAnimationFrame(() => {
        if (videoElRef.current && videoElRef.current.srcObject !== stream) {
          videoElRef.current.srcObject = stream;
          videoElRef.current.play().catch(() => {});
        }
      });
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        toast.error("Camera blocked. Allow camera access for this site in your browser settings, then try again.");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        toast.error("No camera found on this device.");
      } else if (name === "NotReadableError") {
        toast.error("Camera is being used by another app. Close it and try again.");
      } else {
        toast.error("Couldn't start the camera — use 'From gallery' instead.");
      }
    } finally {
      setCamBusy(false);
    }
  };

  const takePhoto = async () => {
    const v = videoElRef.current;
    if (!v) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth || 1280;
    canvas.height = v.videoHeight || 720;
    canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.9));
    if (!blob) { toast.error("Capture failed, try again"); return; }
    const file = new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
    closeCamera();
    await processFile(file);
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const type = ["video/webm;codecs=vp9", "video/webm", "video/mp4"].find(t => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      const mime = rec.mimeType || "video/webm";
      const ext = mime.includes("mp4") ? "mp4" : "webm";
      const file = new File([new Blob(chunks, { type: mime })], `capture-${Date.now()}.${ext}`, { type: mime });
      closeCamera();
      await processFile(file);
    };
    recorderRef.current = rec;
    rec.start();
    setRecording(true);
  };

  const stopRecording = () => {
    try { recorderRef.current?.stop(); } catch { /* ignore */ }
    setRecording(false);
  };


  const captureLocation = () => {
    setLocBusy(true);
    if (!navigator.geolocation) { toast.error("Geolocation unavailable"); setLocBusy(false); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
        if (!location) setLocation(`${p.coords.latitude.toFixed(4)}, ${p.coords.longitude.toFixed(4)}`);
        setLocBusy(false);
        toast.success("Location captured");
      },
      () => { toast.error("Couldn't get location"); setLocBusy(false); }
    );
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    await processFile(f);
  };

  const processFile = async (f: File) => {

    const isVideo = f.type.startsWith("video/");
    const isImage = f.type.startsWith("image/");
    if (mediaKind === "photo" && !isImage) { toast.error("Pick an image"); return; }
    if (mediaKind === "video" && !isVideo) { toast.error("Pick a video"); return; }
    const maxBytes = isVideo ? 40 * 1024 * 1024 : 8 * 1024 * 1024;
    if (f.size > maxBytes) { toast.error(`File too large (${isVideo ? "40" : "8"} MB max)`); return; }

    setMediaFile(f);
    setMediaPreview(URL.createObjectURL(f));
    setAnalysis(null);
    setDuplicates(null);
    setAnalyzing(true);

    try {
      const ext = f.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("report-photos").upload(path, f, { contentType: f.type });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("report-photos").getPublicUrl(path);

      if (isVideo) {
        setVideoUrl(publicUrl);
        // No AI on video — minimal analysis for category selection
        setAnalysis({ title: "Reported issue (video)", description: "Video evidence attached.", category: "other" });
        toast.success("Video uploaded — pick a category");
      } else {
        setPhotoUrl(publicUrl);
        const result = await analyze({ data: { photoUrl: publicUrl } });
        setAnalysis(result);
        toast.success("Issue identified");
      }
    } catch (err) {
      toast.error((err as Error).message || "Upload failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const checkDuplicates = async (): Promise<boolean> => {
    if (!analysis) return false;
    const { data } = await supabase
      .from("reports")
      .select("id, title, category, status, photo_url, location_name, latitude, longitude, created_at")
      .eq("category", analysis.category)
      .neq("status", "fixed")
      .neq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    let candidates = (data ?? []) as Omit<ExistingReport, "vote_count">[];
    if (coords) {
      candidates = candidates.filter(r =>
        r.latitude != null && r.longitude != null &&
        distanceMeters(coords, { lat: r.latitude, lng: r.longitude }) <= NEARBY_METERS
      );
    } else if (location.trim()) {
      const loc = location.trim().toLowerCase();
      candidates = candidates.filter(r => (r.location_name ?? "").toLowerCase().includes(loc) || loc.includes((r.location_name ?? "").toLowerCase()));
    } else {
      candidates = [];
    }
    candidates = candidates.slice(0, 5);

    if (candidates.length === 0) return false;

    // Fetch vote counts
    const ids = candidates.map(c => c.id);
    const { data: votes } = await supabase.from("report_votes").select("report_id").in("report_id", ids);
    const counts = new Map<string, number>();
    (votes ?? []).forEach(v => counts.set(v.report_id, (counts.get(v.report_id) ?? 0) + 1));

    setDuplicates(candidates.map(c => ({ ...c, vote_count: counts.get(c.id) ?? 0 })));
    return true;
  };

  const upvoteAndJoin = async (reportId: string) => {
    const { error } = await supabase.from("report_votes").insert({ report_id: reportId, user_id: user.id });
    if (error && !error.message.includes("duplicate")) { toast.error(error.message); return; }
    toast.success("Joined the existing report!");
    navigate({ to: "/r/$id", params: { id: reportId } });
  };

  const submit = async () => {
    if (!analysis || (!photoUrl && !videoUrl)) { toast.error("Add a photo or video first"); return; }
    if (!coords) { toast.error("Fetch your live location first"); return; }
    setSubmitting(true);
    try {
      const found = await checkDuplicates();
      if (found) { setSubmitting(false); return; }

      const { error } = await supabase.from("reports").insert({
        user_id: user.id,
        title: analysis.title,
        description: analysis.description,
        category: analysis.category,
        photo_url: photoUrl,
        video_url: videoUrl,
        location_name: location.trim().slice(0, 200) || null,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
      });
      if (error) throw error;
      toast.success("Report submitted!");
      navigate({ to: "/feed" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const submitAnyway = async () => {
    setDuplicates(null);
    setSubmitting(true);
    try {
      const { error } = await supabase.from("reports").insert({
        user_id: user.id,
        title: analysis!.title,
        description: analysis!.description,
        category: analysis!.category,
        photo_url: photoUrl,
        video_url: videoUrl,
        location_name: location.trim().slice(0, 200) || null,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
      });
      if (error) throw error;
      toast.success("Report submitted!");
      navigate({ to: "/feed" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const cat = analysis ? categoryMeta(analysis.category) : null;
  const CatIcon = cat?.icon;

  return (
    <AppShell title="New Report">
      <div className="space-y-5">
        {/* Media kind toggle */}
        <div className="flex gap-2 rounded-xl bg-surface p-1">
          {([
            { k: "photo" as const, label: "Photo", Icon: Camera },
            { k: "video" as const, label: "Video", Icon: Video },
          ]).map(({ k, label, Icon }) => (
            <button
              key={k}
              type="button"
              onClick={() => switchKind(k)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${mediaKind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {/* Media */}
        <div>
          <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {mediaKind === "photo" ? "Photo" : "Video"}
          </label>
          <div
            className="relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-surface"
          >
            {mediaPreview ? (
              mediaKind === "video" ? (
                <video src={mediaPreview} controls className="h-full w-full object-cover" />
              ) : (
                <img src={mediaPreview} alt="preview" className="h-full w-full object-cover" />
              )
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                {mediaKind === "video" ? <Video className="h-8 w-8" /> : <Camera className="h-8 w-8" />}
                <span className="text-sm">Add a {mediaKind}</span>
                <span className="text-xs">{mediaKind === "photo" ? "AI will identify the issue" : "Pick a category after upload"}</span>
              </div>
            )}
            {analyzing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 backdrop-blur">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                <span className="text-sm font-medium">{mediaKind === "video" ? "Uploading…" : "Analyzing photo…"}</span>
              </div>
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" disabled={analyzing || camBusy} onClick={openCamera}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {camBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : mediaKind === "video" ? <Video className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
              {camBusy ? "Opening camera…" : mediaKind === "video" ? "Record video" : "Take photo"}
            </button>

            <button type="button" disabled={analyzing} onClick={() => fileRef.current?.click()}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-surface-elevated text-sm font-semibold disabled:opacity-60">
              <ImageIcon className="h-4 w-4" /> From gallery
            </button>
          </div>
          <input
            ref={cameraRef}
            type="file"
            accept={mediaKind === "video" ? "video/*" : "image/*"}
            capture="environment"
            onChange={onFile}
            className="hidden"
          />
          <input
            ref={fileRef}
            type="file"
            accept={mediaKind === "video" ? "video/*" : "image/*"}
            onChange={onFile}
            className="hidden"
          />
          {mediaPreview && !analyzing && (
            <button type="button" onClick={reset} className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <RotateCcw className="h-3 w-3" /> Remove
            </button>
          )}
        </div>

        {/* AI Result (photo only) */}
        {analysis && cat && CatIcon && mediaKind === "photo" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-primary">
              <Sparkles className="h-3.5 w-3.5" /> AI identified
            </div>
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-elevated">
                <CatIcon className="h-4 w-4" style={{ color: cat.color }} />
              </div>
              <span className="text-sm font-medium">{cat.label}</span>
            </div>
            <h3 className="text-base font-semibold">{analysis.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{analysis.description}</p>
          </motion.div>
        )}

        {/* Category override / picker */}
        {analysis && (
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Category {mediaKind === "photo" ? "(adjust if needed)" : "(pick one)"}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map(c => {
                const Icon = c.icon;
                const active = analysis.category === c.value;
                return (
                  <motion.button type="button" key={c.value} whileTap={{ scale: 0.95 }}
                    onClick={() => setAnalysis({ ...analysis, category: c.value, title: mediaKind === "video" ? `${c.label} issue reported` : analysis.title })}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 transition ${active ? "border-primary bg-primary/10" : "border-border bg-surface"}`}>
                    <Icon className="h-5 w-5" style={{ color: active ? "var(--color-primary)" : c.color }} />
                    <span className="text-xs font-medium">{c.label}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}

        {/* Location */}
        <Field label="Location">
          <div className="flex gap-2">
            <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} className="input flex-1" placeholder="e.g. Library, 3rd floor" />
            <button type="button" onClick={captureLocation} className={`flex h-12 w-12 items-center justify-center rounded-xl ${coords ? "bg-primary text-primary-foreground" : "bg-surface-elevated text-primary"}`}>
              {locBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <MapPin className="h-5 w-5" />}
            </button>
          </div>
          {coords ? (
            <p className="mt-1 text-xs text-muted-foreground">Live location captured: {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}</p>
          ) : (
            <p className="mt-1 text-xs text-warning">Tap the pin to fetch your live location — required to submit.</p>
          )}
        </Field>

        <button type="button" onClick={submit} disabled={submitting || analyzing || !analysis || !coords}
          className="flex h-14 w-full items-center justify-center rounded-2xl gradient-hero font-semibold text-primary-foreground shadow-glow disabled:opacity-60">
          {submitting ? "Checking…" : !coords ? "Fetch location to submit" : "Submit Report"}
        </button>
      </div>

      {/* Live camera */}
      <AnimatePresence>
        {cameraOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex flex-col bg-black">
            <video ref={videoElRef} autoPlay playsInline muted className="min-h-0 flex-1 w-full object-cover" />
            <div className="flex items-center justify-between gap-4 p-6 pb-10">
              <button type="button" onClick={closeCamera} className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white">
                <X className="h-5 w-5" />
              </button>
              {mediaKind === "photo" ? (
                <button type="button" onClick={takePhoto} aria-label="Capture photo"
                  className="h-[72px] w-[72px] rounded-full border-4 border-white bg-white/30 p-1">
                  <span className="block h-full w-full rounded-full bg-white" />
                </button>
              ) : recording ? (
                <button type="button" onClick={stopRecording} aria-label="Stop recording"
                  className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white bg-red-600">
                  <span className="block h-6 w-6 rounded bg-white" />
                </button>
              ) : (
                <button type="button" onClick={startRecording} aria-label="Start recording"
                  className="h-[72px] w-[72px] rounded-full border-4 border-white bg-red-600" />
              )}
              <div className="h-12 w-12" />
            </div>
            {recording && (
              <div className="absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white">
                Recording…
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Duplicate modal */}

      <AnimatePresence>
        {duplicates && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 p-4 backdrop-blur sm:items-center">
            <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
              className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-surface shadow-glow">
              <div className="border-b border-border bg-warning/10 p-4">
                <div className="flex items-center gap-2 text-warning">
                  <AlertTriangle className="h-5 w-5" />
                  <h3 className="text-base font-bold">Already reported nearby</h3>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  One issue = one ticket. Join an existing report instead of duplicating.
                </p>
              </div>
              <div className="max-h-[50vh] space-y-2 overflow-y-auto p-3">
                {duplicates.map(r => {
                  const m = categoryMeta(r.category);
                  const Icon = m.icon;
                  return (
                    <div key={r.id} className="flex gap-3 rounded-2xl border border-border bg-background p-3">
                      {r.photo_url ? (
                        <img src={r.photo_url} alt="" className="h-16 w-16 rounded-xl object-cover" />
                      ) : (
                        <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-surface">
                          <Icon className="h-6 w-6" style={{ color: m.color }} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{r.title}</p>
                        {r.location_name && <p className="truncate text-xs text-muted-foreground">{r.location_name}</p>}
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{r.status.replace("_", " ")}</span>
                          <span className="text-[10px] text-muted-foreground">· {r.vote_count + 1} reporter{r.vote_count ? "s" : ""}</span>
                        </div>
                        <div className="mt-2 flex gap-2">
                          <button onClick={() => upvoteAndJoin(r.id)}
                            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                            <ThumbsUp className="h-3 w-3" /> Join
                          </button>
                          <Link to="/r/$id" params={{ id: r.id }} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium">
                            View
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2 border-t border-border p-3">
                <button onClick={() => setDuplicates(null)} className="flex-1 rounded-xl border border-border px-3 py-2 text-sm font-medium">Cancel</button>
                <button onClick={submitAnyway} disabled={submitting} className="flex-1 rounded-xl bg-surface-elevated px-3 py-2 text-sm font-medium disabled:opacity-60">
                  {submitting ? "…" : "Submit anyway"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`.input { width: 100%; height: 3rem; padding: 0 1rem; border-radius: 0.875rem; background: var(--color-input); border: 1px solid var(--color-border); color: var(--color-foreground); font-size: 0.95rem; outline: none; resize: vertical; } .input:focus { border-color: var(--color-primary); }`}</style>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
