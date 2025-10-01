"use client";

import {
  AiMicIcon,
  AiSecurity01Icon,
  DashboardBrowsingIcon,
  HierarchySquare01Icon,
  Idea01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth-client";

type NavItem = {
  title: string;
  icon: typeof DashboardBrowsingIcon;
  url: string;
};

const items: NavItem[] = [
  {
    title: "Dashboard",
    icon: DashboardBrowsingIcon,
    url: "/dashboard",
  },
  {
    title: "Signals",
    icon: Idea01Icon,
    url: "/signals",
  },
  {
    title: "Podcasts",
    icon: AiMicIcon,
    url: "/podcasts",
  },
];

export function BottomNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const allItems = [
    ...items,
    ...(isAdmin
      ? [
          {
            title: "Debug",
            icon: HierarchySquare01Icon,
            url: "/debug",
          },
          {
            title: "Admin",
            icon: AiSecurity01Icon,
            url: "/admin",
          },
        ]
      : []),
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background md:hidden">
      <div className="flex items-center justify-around px-2 py-2">
        {allItems.map((item) => {
          const isActive = pathname === item.url;
          return (
            <Link
              key={item.title}
              href={item.url}
              className={`flex flex-col items-center gap-1 rounded-lg px-4 py-2 transition-colors ${
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <HugeiconsIcon icon={item.icon} size={20} />
              <span className="text-xs">{item.title}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
