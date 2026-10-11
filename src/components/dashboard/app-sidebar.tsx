"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  History,
  MessagesSquare,
  Settings,
  HelpCircle,
  Home,
  Search,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { CommandMenuShortcut, useOpenCommandMenu } from "@/components/command-menu/command-menu";
import { COMMAND_MENU } from "@/components/command-menu/copy";
import { place } from "@/components/auth/account";
import { NavUser } from "./nav-user";

// The account's places (components/auth/account.ts), as every menu names them
const navMain = [
  { ...place("dashboard"), icon: LayoutDashboard },
  { ...place("sessions"), icon: History },
  { ...place("retros"), icon: MessagesSquare },
].map(({ label, href, icon }) => ({ title: label, url: href, icon }));

const navSecondary: { title: string; url: string; icon: typeof Settings; external?: boolean }[] = [
  {
    title: place("settings").label,
    url: place("settings").href,
    icon: Settings,
  },
  {
    title: "Help",
    url: "https://github.com/spokvulcan/poker-planning/issues",
    icon: HelpCircle,
    external: true,
  },
  {
    title: "Back to Home",
    url: "/",
    icon: Home,
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const openCommandMenu = useOpenCommandMenu();

  return (
    <Sidebar variant="inset" collapsible="offcanvas">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />}>
              <div className="flex aspect-square size-8 items-center justify-center">
                <Image
                  src="/logo.svg"
                  alt="AgileKit"
                  width={32}
                  height={32}
                  className="size-8"
                />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold">AgileKit</span>
                <span className="text-xs text-muted-foreground">Dashboard</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {openCommandMenu && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={openCommandMenu}
                    tooltip={COMMAND_MENU.trigger}
                    aria-keyshortcuts="Meta+K Control+K"
                    className="text-muted-foreground"
                  >
                    <Search className="size-4" />
                    <span>{COMMAND_MENU.trigger}</span>
                    <CommandMenuShortcut className="ml-auto" />
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {navMain.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    render={<Link href={item.url} />}
                    isActive={pathname === item.url}
                    tooltip={item.title}
                  >
                    <item.icon className="size-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              {navSecondary.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    render={item.external ? <a href={item.url} target="_blank" rel="noopener noreferrer" /> : <Link href={item.url} />}
                    isActive={!item.external && pathname === item.url}
                    tooltip={item.title}
                  >
                    <item.icon className="size-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
