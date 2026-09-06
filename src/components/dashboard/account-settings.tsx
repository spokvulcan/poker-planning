"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/auth/auth-provider";
import { useDeleteAccount } from "@/hooks/useDeleteAccount";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/lib/toast";
import {
  ACCOUNT_DELETED,
  CANCEL_BUTTON,
  DELETE_ACCOUNT_BUTTON,
  DELETE_ACCOUNT_SECTION_DESCRIPTION,
  DELETE_ACCOUNT_SECTION_TITLE,
  DELETE_ACCOUNT_TITLE,
  DELETING_ACCOUNT_BUTTON,
  EMAIL_OPT_IN_DESCRIPTION,
  EMAIL_OPT_IN_FAILED,
  EMAIL_OPT_IN_LABEL,
  EMAIL_SECTION_TITLE,
} from "@/convex/retroCopy";

/**
 * The Account tab (spec §16.4, §15.2, §18.1): the one email switch covering
 * every nudge and reminder, on unless the account opted out (sign-in
 * emails are never covered); and, for a permanent account, Delete account
 * behind a confirmation that says what stays (ADR-0019). An anonymous
 * account is deleted by signing out, so it has no button here.
 */
export function AccountSettings() {
  const user = useQuery(api.users.getGlobalUser);
  const setEmailOptOut = useMutation(api.users.setEmailOptOut);
  const { accountType } = useAuth();
  const deleteAccount = useDeleteAccount();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const toggle = async (checked: boolean) => {
    try {
      await setEmailOptOut({ optOut: !checked });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : EMAIL_OPT_IN_FAILED);
    }
  };

  // The confirmation stays open on a refusal (the last-admin rule), so the
  // next attempt is one click away once the Team is sorted out.
  const handleDelete = async () => {
    setIsDeleting(true);
    if (await deleteAccount()) {
      setConfirmDelete(false);
    }
    setIsDeleting(false);
  };

  return (
    <div className="space-y-6">
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

      {accountType === "permanent" && (
        <Card data-testid="delete-account">
          <CardHeader>
            <CardTitle>{DELETE_ACCOUNT_SECTION_TITLE}</CardTitle>
            <CardDescription>{DELETE_ACCOUNT_SECTION_DESCRIPTION}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" />
              {DELETE_ACCOUNT_BUTTON}
            </Button>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={(open) => !isDeleting && setConfirmDelete(open)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{DELETE_ACCOUNT_TITLE}</AlertDialogTitle>
            <AlertDialogDescription>{ACCOUNT_DELETED}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{CANCEL_BUTTON}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? DELETING_ACCOUNT_BUTTON : DELETE_ACCOUNT_BUTTON}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
