"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PERSON_NAME } from "@/convex/constants";

interface EditNameDialogProps {
  currentName: string;
  onSave: (name: string) => Promise<void>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditNameDialog({
  currentName,
  onSave,
  open,
  onOpenChange,
}: EditNameDialogProps) {
  const [name, setName] = useState(currentName);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName(currentName);
      setError(null);
    }
  }, [open, currentName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // The rule the server keeps a name by, in its own words.
    const checked = PERSON_NAME.check(name);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await onSave(checked.value);
      onOpenChange(false);
    } catch {
      setError("Failed to update name. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit your name</DialogTitle>
          <DialogDescription>
            This name will be visible to other participants.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              maxLength={PERSON_NAME.maxLength}
              aria-invalid={!!error}
              disabled={isLoading}
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
