import { Wifi, Droplets, Lightbulb, Armchair, Wind, Wrench } from "lucide-react";
export const CATEGORIES = [
  { value: "wifi", label: "WiFi", icon: Wifi, color: "oklch(0.7 0.15 230)" },
  { value: "plumbing", label: "Plumbing", icon: Droplets, color: "oklch(0.7 0.15 200)" },
  { value: "lights", label: "Lights", icon: Lightbulb, color: "oklch(0.82 0.17 75)" },
  { value: "furniture", label: "Furniture", icon: Armchair, color: "oklch(0.7 0.15 30)" },
  { value: "hvac", label: "HVAC", icon: Wind, color: "oklch(0.7 0.15 180)" },
  { value: "other", label: "Other", icon: Wrench, color: "oklch(0.65 0.05 260)" },
] as const;

export type Category = typeof CATEGORIES[number]["value"];
export const categoryMeta = (v: string) => CATEGORIES.find(c => c.value === v) ?? CATEGORIES[5];

export const STATUS_META = {
  pending: { label: "Pending", color: "var(--color-warning)", fg: "var(--color-warning-foreground)" },
  in_progress: { label: "In Progress", color: "var(--color-accent)", fg: "var(--color-accent-foreground)" },
  fixed: { label: "Fixed", color: "var(--color-success)", fg: "var(--color-success-foreground)" },
} as const;
