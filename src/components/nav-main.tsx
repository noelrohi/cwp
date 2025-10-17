"use client";

import {
  AiMicIcon,
  AiSecurity01Icon,
  DashboardBrowsingIcon,
  DatabaseSync01Icon,
  FavouriteIcon,
  FileAttachmentIcon,
  HierarchySquare01Icon,
  Idea01Icon,
  LibraryIcon,
  MessageMultiple01Icon,
  Scissor01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { useSession } from "@/lib/auth-client";

type NavItem = {
  title: string;
  icon: typeof DashboardBrowsingIcon;
  url?: string;
  badge?: string;
  items?: { title: string; url: string; badge?: string }[];
};

type NavGroup = {
  title?: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      {
        title: "Dashboard",
        icon: DashboardBrowsingIcon,
        url: "/dashboard",
      },
      {
        title: "Library",
        icon: LibraryIcon,
        url: "/library",
      },
      {
        title: "Chat",
        icon: MessageMultiple01Icon,
        url: "/chat",
      },
      {
        title: "Signals",
        icon: Idea01Icon,
        items: [
          { title: "Episodes", url: "/signals/episodes" },
          { title: "Articles", url: "/signals/articles" },
        ],
      },
    ],
  },
  {
    title: "Library",
    items: [
      {
        title: "Podcasts",
        icon: AiMicIcon,
        url: "/podcasts",
      },
      {
        title: "Articles",
        icon: FileAttachmentIcon,
        url: "/articles",
      },
      {
        title: "Favorites",
        icon: FavouriteIcon,
        url: "/favorites",
      },
      {
        title: "Snips",
        icon: Scissor01Icon,
        url: "/snips",
      },
    ],
  },
  {
    title: "Integrations",
    items: [
      {
        title: "Readwise",
        icon: DatabaseSync01Icon,
        url: "/integrations/readwise",
      },
    ],
  },
];

function renderNavItem(item: NavItem, pathname: string) {
  if (item.items && item.items.length > 0) {
    const isAnySubItemActive = item.items.some((subItem) =>
      pathname.startsWith(subItem.url),
    );
    return (
      <Collapsible key={item.title} asChild defaultOpen={isAnySubItemActive}>
        <SidebarMenuItem className="group/collapsible">
          <CollapsibleTrigger asChild>
            <SidebarMenuButton
              tooltip={item.title}
              isActive={isAnySubItemActive}
            >
              {item.icon && <HugeiconsIcon icon={item.icon} size={20} />}
              <span className="text-base">{item.title}</span>
              <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub className="border-border">
              {item.items.map((subItem) => {
                const isActive = pathname === subItem.url;
                return (
                  <SidebarMenuSubItem key={subItem.title}>
                    <SidebarMenuSubButton asChild isActive={isActive}>
                      <Link href={subItem.url}>
                        <span>{subItem.title}</span>
                        {subItem.badge && (
                          <Badge
                            variant="secondary"
                            className="ml-auto text-xs"
                          >
                            {subItem.badge}
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                );
              })}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    );
  }

  const isActive = pathname === item.url;
  return (
    <SidebarMenuItem key={item.title}>
      <SidebarMenuButton asChild tooltip={item.title} isActive={isActive}>
        <Link href={item.url ?? "#"}>
          {item.icon && <HugeiconsIcon icon={item.icon} size={20} />}
          <span className="text-base">{item.title}</span>
          {item.badge && (
            <Badge variant="secondary" className="ml-auto text-xs">
              {item.badge}
            </Badge>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function NavMain() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const adminGroup: NavGroup = {
    title: "Admin",
    items: [
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
    ],
  };

  const navGroups: NavGroup[] = [
    ...NAV_GROUPS,
    ...(isAdmin ? [adminGroup] : []),
  ];

  return (
    <>
      {navGroups.map((group, index) => (
        <SidebarGroup key={group.title || index}>
          {group.title && <SidebarGroupLabel>{group.title}</SidebarGroupLabel>}
          <SidebarGroupContent className="flex flex-col gap-2">
            <SidebarMenu>
              {group.items.map((item) => renderNavItem(item, pathname))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
