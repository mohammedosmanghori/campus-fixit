import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Camera, MapPin, Bell, Trophy, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/feed" />;

  const features = [
    { icon: Camera, label: "Snap a photo" },
    { icon: MapPin, label: "Tag the spot" },
    { icon: Bell, label: "Get updates" },
    { icon: Trophy, label: "Earn ranks" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl gradient-hero shadow-glow">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold tracking-tight">CampusFix</span>
        </motion.div>

        <div className="mt-16 flex-1">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-5xl font-bold leading-[1.05] tracking-tight"
          >
            Broken stuff?
            <br />
            <span className="text-gradient">Fixed faster.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
            className="mt-5 text-base text-muted-foreground"
          >
            Report campus issues in 10 seconds. Track every repair. Climb the leaderboard.
          </motion.p>

          <div className="mt-12 grid grid-cols-2 gap-3">
            {features.map((f, i) => (
              <motion.div
                key={f.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 + i * 0.06 }}
                className="rounded-2xl border border-border bg-surface p-4"
              >
                <f.icon className="h-6 w-6 text-primary" />
                <p className="mt-3 text-sm font-medium">{f.label}</p>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="space-y-3">
          <Link to="/auth" className="flex h-14 items-center justify-center rounded-2xl gradient-hero font-semibold text-primary-foreground shadow-glow">
            Get started with college email
          </Link>
          <p className="text-center text-xs text-muted-foreground">Use any .edu address — students only.</p>
        </motion.div>
      </div>
    </div>
  );
}
