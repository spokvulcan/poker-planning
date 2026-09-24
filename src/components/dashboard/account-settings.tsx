"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useDeleteAccount } from "@/hooks/useDeleteAccount";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  ACCOUNT_DELETED,
  CANCEL_BUTTON,
  DELETE_ACCOUNT_BUTTON,
  DELETE_ACCOUNT_SECTION_DESCRIPTION,
  DELETE_ACCOUNT_SECTION_TITLE,
  DELETE_ACCOUNT_TITLE,
  DELETING_ACCOUNT_BUTTON,
  GUEST_ACCOUNT_DESCRIPTION,
  GUEST_ACCOUNT_TITLE,
} from "@/convex/accountCopy";

/**
 * The Account tab: for a permanent account, Delete account behind a
 * confirmation that says what stays. An anonymous account is deleted by
 * signing out, so it gets a line saying so instead.
 */
export function AccountSettings() {
  const { accountType } = useAuth();
  const deleteAccount = useDeleteAccount();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // The confirmation stays open when the deletion fails, so the next
  // attempt is one click away.
  const handleDelete = async () => {
    setIsDeleting(true);
    if (await deleteAccount()) {
      setConfirmDelete(false);
    }
    setIsDeleting(false);
  };

  return (
    <div className="space-y-6">
      {accountType !== "permanent" && (
        <Card data-testid="guest-account">
          <CardHeader>
            <CardTitle>{GUEST_ACCOUNT_TITLE}</CardTitle>
            <CardDescription>{GUEST_ACCOUNT_DESCRIPTION}</CardDescription>
          </CardHeader>
        </Card>
      )}

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
