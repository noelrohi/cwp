import {
  Code2Icon,
  CompassIcon,
  GraduationCapIcon,
  SparklesIcon,
} from "lucide-react";
import type { ReactNode } from "react";

export type CategoryKey = "consulting" | "ai" | "product" | "growth";

export const tabs: { key: CategoryKey; label: string; icon: ReactNode }[] = [
  {
    key: "consulting",
    label: "Consulting",
    icon: <CompassIcon className="mr-2 size-4" />,
  },
  { key: "ai", label: "AI", icon: <SparklesIcon className="mr-2 size-4" /> },
  {
    key: "product",
    label: "Product",
    icon: <Code2Icon className="mr-2 size-4" />,
  },
  {
    key: "growth",
    label: "Growth",
    icon: <GraduationCapIcon className="mr-2 size-4" />,
  },
];

export const suggestionsByCategory: Record<CategoryKey, string[]> = {
  consulting: [
    "Episodes where consultants discuss pricing and packaging for B2B services",
    "Summarize frameworks for scoping, proposals, and SOWs from podcasts",
    "Case‑study episodes on turning expertise into productized services",
    "Tips on discovery calls from consulting podcasts—share links and notes",
  ],
  ai: [
    "Find podcasts that explain RAG in production—include links and timestamps",
    "Summarize takeaways on AI evaluation and LLM metrics from recent episodes",
    "Interviews with founders shipping AI copilots—share lessons and resources",
    "Pull quotes about prompt engineering pitfalls from top AI podcasts",
  ],
  product: [
    "Episodes on PMF and early user research for developer tools",
    "Discussions about roadmap prioritization with real product examples",
    "Podcast teardowns covering onboarding flows—include timestamps",
    "Monetization experiments for SaaS: find and summarize key episodes",
  ],
  growth: [
    "Growth loops and retention for SaaS—round up the best episodes",
    "Content‑driven growth tactics discussed by podcast hosts and guests",
    "Episodes on SEO for developers and technical marketing",
    "PLG onboarding examples from growth podcasts—share quotes and links",
  ],
};
