"use client";

import { usePathname } from "next/navigation";

/** The 404's badge: the address that matched nothing. */
export function RequestedPath() {
  const path = usePathname();

  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-red-50 px-3 py-1 font-mono text-xs font-medium text-red-700 dark:bg-status-error-bg dark:text-status-error-fg">
      <span className="font-bold">404</span>
      <span className="truncate">{path}</span>
    </span>
  );
}
