import React, { useEffect, useState } from "react";
import { WifiOff, RefreshCw, ChevronDown, Trash2, RotateCcw, LogIn } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

interface QueueItem {
  id: number;
  label: string;
  timestamp: number;
  rejectionReason?: string;
}

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  // Previously an expired session while offline meant queued items would
  // retry forever with no way for the officer to know why — see B2 in the
  // audit. This flag lets the banner say so plainly instead.
  const [authExpiredCount, setAuthExpiredCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [showQueueDialog, setShowQueueDialog] = useState(false);
  const [queued, setQueued] = useState<QueueItem[]>([]);
  const [rejected, setRejected] = useState<QueueItem[]>([]);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  useEffect(() => {
    const online = () => setIsOffline(false);
    const offline = () => setIsOffline(true);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  const requestQueueStatus = () => {
    navigator.serviceWorker?.controller?.postMessage({ type: "GET_QUEUE_STATUS" });
  };

  // Listen for messages from the service worker
  useEffect(() => {
    if (!navigator.serviceWorker) return;

    const handler = (event: MessageEvent) => {
      switch (event.data?.type) {
        case "QUEUED":
          setPendingCount(event.data.pending ?? 0);
          toast({
            title: "Saved offline",
            description: `${event.data.pending} action(s) queued — will sync when reconnected.`,
          });
          break;
        case "SYNC_COMPLETE":
          // Use the SW's own recount rather than assuming 0 — some items
          // may have been re-queued (auth-expired) or rejected in the same
          // sync pass, so "everything's clear" isn't always true.
          setPendingCount(event.data.pending ?? 0);
          toast({
            title: "Changes synced",
            description: `${event.data.replayed} queued action(s) were submitted successfully.`,
          });
          queryClient.invalidateQueries();
          break;
        case "SYNC_AUTH_EXPIRED":
          setAuthExpiredCount(event.data.pending ?? 0);
          toast({
            title: "Session expired while offline",
            description: "Log in again to sync your queued changes — they haven't been lost.",
            variant: "destructive",
          });
          break;
        case "SYNC_ITEMS_REJECTED":
          setRejectedCount((c) => c + (event.data.count ?? 0));
          toast({
            title: "Some queued changes were rejected",
            description: "Open the queue to review and resolve them — they won't retry automatically.",
            variant: "destructive",
          });
          break;
        case "QUEUE_STATUS":
          setQueued(event.data.queued ?? []);
          setRejected(event.data.rejected ?? []);
          setPendingCount((event.data.queued ?? []).length);
          setRejectedCount((event.data.rejected ?? []).length);
          break;
      }
    };

    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [queryClient, toast]);

  const openQueueDialog = () => {
    requestQueueStatus();
    setShowQueueDialog(true);
  };

  const discardItem = (id: number, store: "queue" | "rejected") => {
    navigator.serviceWorker?.controller?.postMessage({
      type: "DISCARD_ITEM", id, store: store === "rejected" ? "rejected" : "mutations",
    });
    setTimeout(requestQueueStatus, 150);
  };

  const retryItem = (id: number) => {
    navigator.serviceWorker?.controller?.postMessage({ type: "RETRY_ITEM", id });
    setTimeout(requestQueueStatus, 300);
  };

  const showBanner = isOffline || pendingCount > 0 || authExpiredCount > 0 || rejectedCount > 0;
  if (!showBanner) return null;

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-amber-500 text-amber-950 print:hidden">
        {authExpiredCount > 0 ? (
          <>
            <LogIn className="w-4 h-4 shrink-0" />
            <span>
              Your session expired while offline. {authExpiredCount} action(s) are saved and waiting — log in
              again to sync them.
            </span>
            <button className="underline font-semibold" onClick={() => navigate("/login")}>Log in</button>
          </>
        ) : isOffline ? (
          <>
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>
              You are offline.
              {pendingCount > 0
                ? ` ${pendingCount} action(s) queued — will sync automatically when reconnected.`
                : " Changes will be queued and synced when reconnected."}
            </span>
          </>
        ) : pendingCount > 0 ? (
          <>
            <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
            <span>Syncing {pendingCount} queued action(s)…</span>
          </>
        ) : rejectedCount > 0 ? (
          <span>{rejectedCount} queued action(s) need your attention.</span>
        ) : null}

        {(pendingCount > 0 || rejectedCount > 0) && (
          <button
            className="underline flex items-center gap-1 ml-2"
            onClick={openQueueDialog}
          >
            View queue <ChevronDown className="w-3 h-3" />
          </button>
        )}
      </div>

      <Dialog open={showQueueDialog} onOpenChange={setShowQueueDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Offline queue</DialogTitle>
            <DialogDescription>
              Actions saved on this device that haven't reached the server yet. Previously the banner only ever
              showed a bare count with no way to inspect or clear a stuck item — see U7 in the audit.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div>
              <h3 className="text-sm font-semibold mb-2">Waiting to sync ({queued.length})</h3>
              {queued.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing queued.</p>
              ) : (
                <ul className="space-y-2">
                  {queued.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2 text-sm border rounded-md p-2">
                      <span className="truncate">{item.label}</span>
                      <Button size="sm" variant="ghost" onClick={() => discardItem(item.id, "queue")}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {rejected.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2 text-destructive">Rejected — needs review ({rejected.length})</h3>
                <ul className="space-y-2">
                  {rejected.map((item) => (
                    <li key={item.id} className="flex flex-col gap-1 text-sm border border-destructive/40 rounded-md p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{item.label}</span>
                        <div className="flex gap-1 shrink-0">
                          <Button size="sm" variant="ghost" title="Retry" onClick={() => retryItem(item.id)}>
                            <RotateCcw className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" title="Discard" onClick={() => discardItem(item.id, "rejected")}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                      {item.rejectionReason && (
                        <span className="text-xs text-muted-foreground">{item.rejectionReason}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
