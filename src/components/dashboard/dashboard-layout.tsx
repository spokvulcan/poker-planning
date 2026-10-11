"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { signInHref } from "@/components/auth/account";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { DateRangeProvider } from "./date-range-context";

interface DashboardLayoutProps {
  children: ReactNode;
  defaultOpen?: boolean;
}

/**
 * Every dashboard page is an account's own. The server sends a visitor who
 * asks for one to sign in; this sends one who becomes a visitor while on it
 * (signing out here or in another tab), coming back to the page once they're in.
 */
function useAccountPage() {
  const { viewer } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (viewer.status === "visitor") router.replace(signInHref(pathname));
  }, [viewer.status, pathname, router]);
}

export function DashboardLayout({
  children,
  defaultOpen = true,
}: DashboardLayoutProps) {
  useAccountPage();
  return (
    <DateRangeProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar />
        <SidebarInset>{children}</SidebarInset>
      </SidebarProvider>
    </DateRangeProvider>
  );
}
