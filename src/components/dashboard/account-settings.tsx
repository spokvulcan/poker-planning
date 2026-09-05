"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";
import {
  EMAIL_OPT_IN_DESCRIPTION,
  EMAIL_OPT_IN_FAILED,
  EMAIL_OPT_IN_LABEL,
  EMAIL_SECTION_TITLE,
} from "@/convex/retroCopy";

/**
 * The Account tab (spec §16.4, §18.1): the one email switch covering
 * every nudge and reminder, on unless the account opted out. Sign-in
 * emails are never covered. #299 adds Delete account here.
 */
export function AccountSettings() {
  const user = useQuery(api.users.getGlobalUser);
  const setEmailOptOut = useMutation(api.users.setEmailOptOut);

  const toggle = async (checked: boolean) => {
    try {
      await setEmailOptOut({ optOut: !checked });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : EMAIL_OPT_IN_FAILED);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{EMAIL_SECTION_TITLE}</CardTitle>
        <CardDescription>{EMAIL_OPT_IN_DESCRIPTION}</CardDescription>
      </CardHeader>
      <CardContent>
        {user === undefined ? (
          <Skeleton className="h-6 w-64" />
        ) : (
          <div className="flex items-center gap-3">
            <Switch
              id="email-opt-in"
              checked={user?.emailOptOut !== true}
              onCheckedChange={(checked) => void toggle(checked)}
              disabled={user === null}
            />
            <Label htmlFor="email-opt-in">{EMAIL_OPT_IN_LABEL}</Label>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
