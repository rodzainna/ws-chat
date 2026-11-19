import type { FormEvent } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { formatMessageTimestamp, type ChatMessage } from "@/lib/chat";
import { renderContentWithMentions } from "@/lib/renderMentions";

export function MessageItem({
  message,
  isOwn,
  isOnline,
  canDelete,
  isEditing,
  editDraft,
  onEditDraftChange,
  onStartEdit,
  onSubmitEdit,
  onCancelEdit,
  deleteDialogOpen,
  onDeleteDialogOpenChange,
  deletePending,
  onConfirmDelete,
}: {
  message: ChatMessage;
  isOwn: boolean;
  isOnline: boolean;
  canDelete: boolean;
  isEditing: boolean;
  editDraft: string;
  onEditDraftChange: (value: string) => void;
  onStartEdit: () => void;
  onSubmitEdit: (event: FormEvent) => void;
  onCancelEdit: () => void;
  deleteDialogOpen: boolean;
  onDeleteDialogOpenChange: (open: boolean) => void;
  deletePending: boolean;
  onConfirmDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex flex-col text-sm",
        isOwn ? "items-end" : "items-start",
      )}
    >
      <div className="mb-1 flex items-center gap-2 px-1 text-xs text-muted-foreground">
        {!isOwn && (
          <span className="inline-flex items-center gap-1">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                isOnline ? "bg-green-500" : "bg-muted-foreground/40",
              )}
            />
            <span className="font-medium">{message.username}</span>
          </span>
        )}
        <span>{formatMessageTimestamp(message.createdAt)}</span>
        <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          {message.editedAt && !message.deleted && <span>(edited)</span>}
          {!message.deleted && !isEditing && (
            <span className="hidden gap-1 group-hover:flex">
              {isOwn && (
                <Button
                  type="button"
                  variant="linkMuted"
                  size="inline"
                  onClick={onStartEdit}
                >
                  Edit
                </Button>
              )}
              {canDelete && (
                <AlertDialog
                  open={deleteDialogOpen}
                  onOpenChange={(open) => onDeleteDialogOpenChange(open)}
                >
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="linkMuted" size="inline">
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this message?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This can't be undone — it'll show as "[message deleted]"
                        to everyone in the room.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={deletePending}
                        onClick={(event) => {
                          event.preventDefault();
                          onConfirmDelete();
                        }}
                      >
                        {deletePending ? (
                          <>
                            <Loader2Icon className="animate-spin" />
                            Deleting…
                          </>
                        ) : (
                          "Delete"
                        )}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </span>
          )}
        </div>
      </div>

      {isEditing ? (
        <form
          onSubmit={onSubmitEdit}
          className="flex items-center w-full max-w-[70%] gap-2"
        >
          <Input
            autoFocus
            value={editDraft}
            onChange={(event) => onEditDraftChange(event.target.value)}
          />
          <div className="flex items-center gap-0.5">
            <Button size="sm" type="submit">
              Save
            </Button>
            <Button
              size="sm"
              type="button"
              variant="secondary"
              onClick={onCancelEdit}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div
          className={cn(
            "max-w-[70%] rounded-2xl px-3 py-2",
            isOwn ? "bg-primary text-primary-foreground" : "bg-muted",
            message.deleted && "italic opacity-70",
          )}
        >
          {renderContentWithMentions(
            message.content,
            message.mentionedUsernames,
          )}
        </div>
      )}
    </div>
  );
}
