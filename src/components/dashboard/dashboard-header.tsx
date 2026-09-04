"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { DateRangePicker } from "./DateRangePicker";
import { useDateRange } from "./date-range-context";

interface DashboardHeaderProps {
  title: string;
  /** The analytics pages filter by date; retro surfaces show no time (spec §23). */
  showDateRange?: boolean;
}

export function DashboardHeader({ title, showDateRange = true }: DashboardHeaderProps) {
  const { dateRange, setDateRange } = useDateRange();

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 px-4 transition-all">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4 hidden" />
      <h1 className="flex-1 text-sm font-medium">{title}</h1>
      {showDateRange && <DateRangePicker value={dateRange} onChange={setDateRange} />}
    </header>
  );
}
