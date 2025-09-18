"use client";

import type { Route } from "next";
import Link from "next/link";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function NavRecents({
  items,
}: {
  items: {
    title: string;
    url: string;
  }[];
}) {
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Recents</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item, i) => (
          <SidebarMenuItem key={item.title + i}>
            <SidebarMenuButton asChild className="[&>span]:truncate">
              <Link href={item.url as Route}>
                <span>{item.title}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
