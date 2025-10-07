"use client";

import {
  AiSecurity01Icon,
  FileAttachmentIcon,
  HierarchySquare01Icon,
  Logout01Icon,
  Settings01Icon,
  SidebarLeftIcon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/components/ui/sidebar";
import { signOut, useSession } from "@/lib/auth-client";

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const user = session?.user;
  const { toggleSidebar } = useSidebar();

  // Hide bottom nav on chat page to avoid blocking the composer
  if (pathname === "/chat") {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background md:hidden">
      <div className="flex items-center justify-around py-3">
        {/* Menu Button */}
        <button
          type="button"
          onClick={toggleSidebar}
          className="flex flex-col items-center gap-1 rounded-lg px-4 py-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <HugeiconsIcon icon={SidebarLeftIcon} size={22} />
          <span className="text-xs">Menu</span>
        </button>

        {/* User Profile Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex flex-col items-center gap-1 rounded-lg px-4 py-2 text-muted-foreground transition-colors hover:text-foreground"
            >
              {user ? (
                <>
                  <Avatar className="h-5 w-5 rounded-full">
                    <AvatarImage src={user.image ?? ""} alt={user.name || ""} />
                    <AvatarFallback className="text-[10px]">
                      {user.name?.charAt(0) || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs">Profile</span>
                </>
              ) : (
                <>
                  <HugeiconsIcon icon={UserCircleIcon} size={22} />
                  <span className="text-xs">Profile</span>
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 mb-2">
            {user ? (
              <>
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarImage
                        src={user.image ?? ""}
                        alt={user.name || ""}
                      />
                      <AvatarFallback className="rounded-lg">
                        {user.name?.charAt(0) || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{user.name}</span>
                      <span className="truncate text-muted-foreground text-xs">
                        {user.email}
                      </span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() => router.push("/settings/profile")}
                  >
                    <HugeiconsIcon icon={UserCircleIcon} size={20} />
                    Account
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled>
                    <HugeiconsIcon icon={Settings01Icon} size={16} />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push("/articles")}>
                    <HugeiconsIcon icon={FileAttachmentIcon} size={16} />
                    Articles
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                {isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem onClick={() => router.push("/debug")}>
                        <HugeiconsIcon icon={HierarchySquare01Icon} size={16} />
                        Debug
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => router.push("/admin")}>
                        <HugeiconsIcon icon={AiSecurity01Icon} size={16} />
                        Admin
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    signOut({
                      fetchOptions: {
                        onSuccess: () => {
                          router.push("/sign-in");
                        },
                      },
                    });
                  }}
                >
                  <HugeiconsIcon icon={Logout01Icon} size={16} />
                  Log out
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem onClick={() => router.push("/sign-in")}>
                <HugeiconsIcon icon={UserCircleIcon} size={16} />
                Sign in
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
