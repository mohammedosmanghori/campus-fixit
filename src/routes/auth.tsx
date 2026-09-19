import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState, FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { ArrowLeft, Sparkles } from "lucide-react";

export const Route = createFileRoute("/auth")({ component: Auth });

function Auth() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/feed" />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/feed`, data: { full_name: name } },
        });
        if (error) throw error;
        toast.success("Check your email to verify, then sign in.");
        setMode("login");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
        navigate({ to: "/feed" });
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-6 py-8">
        <button onClick={() => navigate({ to: "/" })} className="flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-8">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl gradient-hero shadow-glow">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{mode === "login" ? "Welcome back" : "Join CampusFix"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "login" ? "Sign in with your email." : "Sign up with any email address."}
          </p>

        </motion.div>

        <form onSubmit={submit} className="mt-8 space-y-4">
          {mode === "signup" && (
            <Field label="Full name">
              <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} className="input" placeholder="Alex Rivera" />
            </Field>
          )}
          <Field label="Email">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={120} className="input" placeholder="you@example.com" />

          </Field>
          <Field label="Password">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="input" placeholder="••••••••" />
          </Field>

          <button type="submit" disabled={busy} className="mt-2 flex h-13 w-full items-center justify-center rounded-2xl gradient-hero py-4 font-semibold text-primary-foreground shadow-glow disabled:opacity-60">
            {busy ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
          </button>

          <button type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")} className="block w-full text-center text-sm text-muted-foreground">
            {mode === "login" ? "New here? Create an account" : "Have an account? Sign in"}
          </button>
        </form>
      </div>

      <style>{`.input { width: 100%; height: 3rem; padding: 0 1rem; border-radius: 0.875rem; background: var(--color-input); border: 1px solid var(--color-border); color: var(--color-foreground); font-size: 0.95rem; outline: none; transition: border-color .15s; } .input:focus { border-color: var(--color-primary); }`}</style>
    </div>
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
