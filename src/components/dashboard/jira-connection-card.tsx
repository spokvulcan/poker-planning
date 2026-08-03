"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { ExternalLink, Unplug } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

interface JiraConnection {
  _id: Id<"integrationConnections">;
  provider: string;
  siteUrl?: string;
  providerUserEmail?: string;
  connectedAt: number;
  scopes: string[];
}

interface JiraConnectionCardProps {
  connection: JiraConnection | null;
}

export function JiraConnectionCard({ connection }: JiraConnectionCardProps) {
  const disconnect = useMutation(api.integrations.disconnect);
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleDisconnect = async () => {
    if (!connection) return;
    setIsDisconnecting(true);
    try {
      await disconnect({ connectionId: connection._id });
    } finally {
      setIsDisconnecting(false);
      setShowDisconnect(false);
    }
  };

  return (
    <>
      <Card className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/30">
              <JiraLogo className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-semibold">Jira Cloud</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Import issues from Jira sprints and push estimates back
                automatically.
              </p>
              {connection && (
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  {connection.siteUrl && connection.siteUrl.startsWith("https://") && (
                    <a
                      href={connection.siteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {new URL(connection.siteUrl).hostname}
                    </a>
                  )}
                  {connection.providerUserEmail && (
                    <span>{connection.providerUserEmail}</span>
                  )}
                  <span>
                    Connected{" "}
                    {new Date(connection.connectedAt).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div>
            {connection ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDisconnect(true)}
              >
                <Unplug className="h-4 w-4 mr-1.5" />
                Disconnect
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => {
                  window.location.href = "/api/integrations/jira/authorize";
                }}
              >
                Connect
              </Button>
            )}
          </div>
        </div>
      </Card>

      <AlertDialog open={showDisconnect} onOpenChange={setShowDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Jira?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all Jira mappings from your rooms. Imported
              issues will remain but won&apos;t sync with Jira anymore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              disabled={isDisconnecting}
            >
              {isDisconnecting ? "Disconnecting..." : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function JiraLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`text-blue-600 ${className}`}
    >
      <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.594 24V12.518a1.005 1.005 0 0 0-1.023-1.005zm0-5.752H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057a5.215 5.215 0 0 0 5.232 5.215V6.766a1.005 1.005 0 0 0-1.023-1.005zm0-5.761H0A5.218 5.218 0 0 0 5.232 5.215h2.13V7.27A5.215 5.215 0 0 0 12.594 12.488V1.005A1.005 1.005 0 0 0 11.571 0z" />
    </svg>
  );
}
