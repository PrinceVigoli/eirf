import React, { useRef, useState } from "react";
import {
  useListEvidenceFiles,
  useAddEvidenceFile,
  useDeleteEvidenceFile,
  getListEvidenceFilesQueryKey,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
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
  Paperclip,
  Upload,
  Trash2,
  Download,
  FileText,
  Image,
  Film,
  File,
  ShieldCheck,
} from "lucide-react";

interface EvidencePanelProps {
  incidentId: number;
  readonly?: boolean;
}

function fileIcon(contentType: string) {
  if (contentType.startsWith("image/")) return <Image className="w-4 h-4" />;
  if (contentType.startsWith("video/")) return <Film className="w-4 h-4" />;
  if (contentType === "application/pdf" || contentType.startsWith("text/"))
    return <FileText className="w-4 h-4" />;
  return <File className="w-4 h-4" />;
}

function formatBytes(bytes: number | null | undefined) {
  if (bytes == null) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EvidencePanel({ incidentId, readonly = false }: EvidencePanelProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [pendingDelete, setPendingDelete] = useState<{ id: number; fileName: string } | null>(null);
  const [verifyingId, setVerifyingId] = useState<number | null>(null);

  const { data: files = [], isLoading } = useListEvidenceFiles(incidentId, {
    query: { queryKey: getListEvidenceFilesQueryKey(incidentId) },
  });

  const addEvidence = useAddEvidenceFile();
  const deleteEvidence = useDeleteEvidenceFile();

  const { uploadFile, isUploading, progress, error: uploadError } = useUpload({
    onSuccess: async (response) => {
      try {
        await addEvidence.mutateAsync({
          id: incidentId,
          data: {
            fileName: response.metadata.name,
            objectPath: response.objectPath,
            contentType: response.metadata.contentType,
            fileSize: response.metadata.size,
          },
        });
        queryClient.invalidateQueries({
          queryKey: getListEvidenceFilesQueryKey(incidentId),
        });
        toast({ title: "Evidence file attached", description: response.metadata.name });
      } catch (err: any) {
        toast({
          title: "Upload failed",
          description: err?.data?.error ?? err?.message ?? "Could not record the file.",
          variant: "destructive",
        });
      }
    },
    onError: (err) => {
      toast({
        title: "Upload failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Unlike the incident form, file uploads go straight to a presigned
    // storage URL rather than through /api/, so the service worker's
    // offline queue never sees them — there's no way to queue this for
    // later, so tell the officer that up front instead of letting it fail
    // with a generic error after they've already picked a file.
    if (!navigator.onLine) {
      toast({
        title: "Can't attach file offline",
        description: "Evidence uploads need a connection — the rest of this form will still save and sync automatically, but attachments have to wait until you're back online.",
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }

    await uploadFile(file);
    // reset input so same file can be re-selected if needed
    e.target.value = "";
  };

  const handleDelete = (fileId: number, fileName: string) => {
    setPendingDelete({ id: fileId, fileName });
  };

  const verifyFile = async (file: { id: number; fileName: string; objectPath: string; sha256?: string | null }) => {
    if (!file.sha256) {
      toast({ title: "No fingerprint available", description: "Re-upload this legacy file to create a SHA-256 fingerprint.", variant: "destructive" });
      return;
    }
    setVerifyingId(file.id);
    try {
      const response = await fetch(`/api/storage${file.objectPath}`, { credentials: "include" });
      if (!response.ok) throw new Error(`Download failed (HTTP ${response.status})`);
      const digest = await crypto.subtle.digest("SHA-256", await response.arrayBuffer());
      const actual = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      if (actual === file.sha256) {
        toast({ title: "Integrity verified", description: `${file.fileName} exactly matches its recorded SHA-256 fingerprint.` });
      } else {
        toast({ title: "Integrity check failed", description: "The stored bytes do not match the recorded fingerprint. Preserve the file and notify an administrator.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Verification failed", description: error instanceof Error ? error.message : "Could not verify file", variant: "destructive" });
    } finally {
      setVerifyingId(null);
    }
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const { id: fileId, fileName } = pendingDelete;
    deleteEvidence.mutate(
      { id: incidentId, fileId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListEvidenceFilesQueryKey(incidentId),
          });
          toast({ title: "Evidence file removed", description: fileName });
        },
        onError: (err: any) => {
          toast({
            title: "Delete failed",
            description: err?.data?.error ?? err?.message ?? "Could not remove the file.",
            variant: "destructive",
          });
        },
        onSettled: () => setPendingDelete(null),
      }
    );
  };

  return (
    <Card className="shadow-sm print:hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Paperclip className="w-4 h-4" />
          Evidence Files
          {files.length > 0 && (
            <Badge variant="secondary">{files.length}</Badge>
          )}
        </CardTitle>
        {!readonly && (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-2" />
              {isUploading ? `Uploading… ${progress}%` : "Attach File"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
            />
          </>
        )}
      </CardHeader>
      <CardContent>
        {uploadError && (
          <p className="text-sm text-destructive mb-3">
            Upload failed: {uploadError.message}
          </p>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded-md" />
            ))}
          </div>
        ) : files.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No evidence files attached yet.
          </p>
        ) : (
          <ul className="divide-y">
            {files.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-muted-foreground shrink-0">
                    {fileIcon(f.contentType)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{f.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(f.fileSize)} · {f.contentType}
                    </p>
                    {f.sha256 && (
                      <p className="text-[11px] text-muted-foreground font-mono truncate" title={f.sha256}>
                        SHA-256: {f.sha256}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    title={f.sha256 ? "Verify stored file integrity" : "Fingerprint unavailable"}
                    onClick={() => verifyFile(f)}
                    disabled={verifyingId === f.id || !f.sha256}
                  >
                    <ShieldCheck className={`w-4 h-4 ${verifyingId === f.id ? "animate-pulse" : ""}`} />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    asChild
                    title="Download"
                  >
                    <a
                      href={`/api/storage${f.objectPath}`}
                      target="_blank"
                      rel="noreferrer"
                      download={f.fileName}
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  </Button>
                  {!readonly && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      title="Delete"
                      onClick={() => handleDelete(f.id, f.fileName)}
                      disabled={deleteEvidence.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove evidence record?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && `"${pendingDelete.fileName}" will be removed from this incident. The source object is retained according to evidence-retention policy.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteEvidence.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteEvidence.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
