import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useMutation, useQuery } from "@apollo/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RoomLabel } from "@/components/chat/RoomLabel";
import { UsernameSuggestions } from "@/components/chat/UsernameSuggestions";
import { useAuth } from "@/auth/useAuth";
import { useSuggestionNavigation } from "@/hooks/useSuggestionNavigation";
import {
  ADD_ROOM_MEMBER_MUTATION,
  REMOVE_ROOM_MEMBER_MUTATION,
  ROOM_MEMBERSHIP_CANDIDATES_QUERY,
} from "@/graphql/queries";
import { cn } from "@/lib/utils";
import type { Room, RoomMemberRow, SuggestionItem } from "@/lib/chat";

// the "N members" button in the room header and the dialog behind it: member
// list, remove (admins) and add people (everyone but restricted users)
export function MembersDialog({
  roomId,
  room,
  members,
  membersLoaded,
  refetchMembers,
}: {
  roomId: string;
  room: Room | undefined;
  members: RoomMemberRow[];
  membersLoaded: boolean;
  refetchMembers: () => Promise<unknown>;
}) {
  const { user } = useAuth();
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addMemberUsername, setAddMemberUsername] = useState("");
  const [addMemberError, setAddMemberError] = useState<string | null>(null);
  const [showAddSuggestions, setShowAddSuggestions] = useState(true);
  const addMemberInputRef = useRef<HTMLInputElement>(null);
  const [removingMemberIds, setRemovingMemberIds] = useState<Set<string>>(
    new Set(),
  );
  const [removeMemberError, setRemoveMemberError] = useState<string | null>(
    null,
  );

  const { data: candidatesData } = useQuery<{
    roomMembershipCandidates: SuggestionItem[];
  }>(ROOM_MEMBERSHIP_CANDIDATES_QUERY, {
    variables: { roomId },
    skip: !roomId || !addMemberOpen,
    fetchPolicy: "network-only",
  });
  const addMemberCandidates = useMemo<SuggestionItem[]>(() => {
    if (!showAddSuggestions) return [];
    const all = candidatesData?.roomMembershipCandidates ?? [];
    const query = addMemberUsername.trim().toLowerCase();
    const matches = query
      ? all.filter((c) => c.username.toLowerCase().startsWith(query))
      : all;
    return matches.slice(0, 8);
  }, [candidatesData, addMemberUsername, showAddSuggestions]);
  const addMemberNav = useSuggestionNavigation(addMemberCandidates.length);

  const [addRoomMember, { loading: addingMember }] = useMutation<
    {
      addRoomMember: {
        room: { id: string } | null;
        userErrors: { field: string[]; message: string }[];
      };
    },
    { roomId: string; username: string }
  >(ADD_ROOM_MEMBER_MUTATION);

  const [removeRoomMember] = useMutation<
    {
      removeRoomMember: {
        room: { id: string } | null;
        userErrors: { field: string[]; message: string }[];
      };
    },
    { roomId: string; userId: string }
  >(REMOVE_ROOM_MEMBER_MUTATION);

  const canAddMembers = membersLoaded && user?.globalRole !== "RESTRICTED";
  const canRemoveMembers = membersLoaded && user?.globalRole === "ADMIN";

  function handleAddMemberUsernameChange(event: ChangeEvent<HTMLInputElement>) {
    setAddMemberUsername(event.target.value);
    setShowAddSuggestions(true);
    addMemberNav.setHighlightedIndex(0);
  }

  function selectAddMemberCandidate(username: string) {
    setAddMemberUsername(username);
    setShowAddSuggestions(false);
    addMemberInputRef.current?.focus();
  }

  function handleAddMemberKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!showAddSuggestions || addMemberCandidates.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      addMemberNav.moveDown();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      addMemberNav.moveUp();
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      selectAddMemberCandidate(
        addMemberCandidates[addMemberNav.highlightedIndex].username,
      );
    } else if (event.key === "Escape") {
      setShowAddSuggestions(false);
    }
  }

  async function handleAddMember(event: FormEvent) {
    event.preventDefault();
    if (!roomId || !addMemberUsername.trim()) return;
    setAddMemberError(null);
    try {
      const result = await addRoomMember({
        variables: { roomId, username: addMemberUsername.trim() },
      });
      const payload = result.data?.addRoomMember;
      if (!payload?.room) {
        setAddMemberError(
          payload?.userErrors[0]?.message ?? "Could not add member",
        );
        return;
      }
    } catch {
      setAddMemberError("Could not add member — try again");
      return;
    }
    setAddMemberUsername("");
    setAddMemberOpen(false);
    await refetchMembers();
  }

  async function handleRemoveMember(memberUserId: string) {
    if (!roomId) return;
    setRemoveMemberError(null);
    setRemovingMemberIds((prev) => new Set(prev).add(memberUserId));
    try {
      const result = await removeRoomMember({
        variables: { roomId, userId: memberUserId },
      });
      const payload = result.data?.removeRoomMember;
      if (!payload?.room) {
        setRemoveMemberError(
          payload?.userErrors[0]?.message ?? "Could not remove member",
        );
        return;
      }
      await refetchMembers();
    } catch {
      setRemoveMemberError(
        "Could not remove member — you may no longer have permission",
      );
    } finally {
      setRemovingMemberIds((prev) => {
        const next = new Set(prev);
        next.delete(memberUserId);
        return next;
      });
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="shrink-0">
          {members.length}{" "}
          <span className="hidden sm:inline">
            member{members.length === 1 ? "" : "s"}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <RoomLabel
              isPrivate={room?.isPrivate ?? false}
              name={room?.name ?? "…"}
            />{" "}
            members
          </DialogTitle>
        </DialogHeader>
        <ul className="space-y-2">
          {members.map((member) => (
            <li key={member.user.id} className="flex items-center gap-2">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  member.isOnline ? "bg-green-500" : "bg-muted-foreground/40",
                )}
              />
              <span>{member.user.username}</span>
              {member.role === "OWNER" && (
                <Badge variant="secondary" className="ml-auto">
                  Owner
                </Badge>
              )}
              {canRemoveMembers && member.role !== "OWNER" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-auto px-2 py-0.5 text-xs text-destructive"
                  disabled={removingMemberIds.has(member.user.id)}
                  onClick={() => void handleRemoveMember(member.user.id)}
                >
                  {removingMemberIds.has(member.user.id)
                    ? "Removing…"
                    : "Remove"}
                </Button>
              )}
            </li>
          ))}
        </ul>
        {removeMemberError && (
          <p className="text-sm text-destructive">{removeMemberError}</p>
        )}
        {canAddMembers && (
          <div className="border-t pt-3">
            {addMemberOpen ? (
              <form
                onSubmit={(event) => void handleAddMember(event)}
                className="flex items-center gap-2"
              >
                <div className="relative flex-1">
                  <Input
                    ref={addMemberInputRef}
                    autoFocus
                    placeholder="Username"
                    value={addMemberUsername}
                    onChange={handleAddMemberUsernameChange}
                    onKeyDown={handleAddMemberKeyDown}
                    onBlur={() => setShowAddSuggestions(false)}
                  />
                  <UsernameSuggestions
                    items={addMemberCandidates}
                    highlightedIndex={addMemberNav.highlightedIndex}
                    onSelect={(item) => selectAddMemberCandidate(item.username)}
                    position="below"
                  />
                </div>
                <Button type="submit" size="sm" disabled={addingMember}>
                  Add
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAddMemberOpen(false);
                    setAddMemberUsername("");
                    setAddMemberError(null);
                  }}
                >
                  Cancel
                </Button>
              </form>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  setAddMemberOpen(true);
                  setShowAddSuggestions(true);
                }}
              >
                Add people
              </Button>
            )}
            {addMemberError && (
              <p className="mt-2 text-sm text-destructive">{addMemberError}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
