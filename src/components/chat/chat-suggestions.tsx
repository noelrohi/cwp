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
    "How does Lee use slash commands in Cursor for code reviews?",
    "What are Lee's tips for getting the most out of AI agents in Cursor?",
    "How does Lee structure his apps to work better with AI agents?",
    "What are Lee's banned words list and writing guidelines for AI?",
  ],
  ai: [
    "How does Lee use Cursor agents for bug fixing and security?",
    "What is BugBot and how does it automate code reviews?",
    "How can you run Cursor agents headlessly in CI/CD pipelines?",
    "What are Lee's thoughts on context window management with AI agents?",
  ],
  product: [
    "How does the Cursor team build Cursor with Cursor?",
    "What are Lee's rules and commands for his project setup?",
    "How does Lee handle linter errors and self-correction with AI?",
    "What are Lee's tips for starting new chats for each task?",
  ],
  growth: [
    "How can you use Cursor agents to fix bugs from Slack reports?",
    "What is Lee's advice for avoiding context window overload?",
    "How does Lee use AI agents for documentation and content creation?",
    "What are Lee's thoughts on personal software and distribution engineering?",
  ],
};
