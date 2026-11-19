import { useEffect, useState } from "react";
import { useQuery } from "@apollo/client";
import { ROOM_MEMBERS_QUERY } from "@/graphql/queries";
import type { RoomMemberRow } from "@/lib/chat";

// the room's member list: owner first, then by name, with the current user
// always shown online. Presence updates arrive over the socket.
export function useRoomMembers(
  roomId: string | undefined,
  currentUserId: string | undefined,
) {
  const { data: membersData, refetch: refetchMembers } = useQuery<{
    roomMembers: RoomMemberRow[];
  }>(ROOM_MEMBERS_QUERY, { variables: { roomId }, skip: !roomId });
  const [members, setMembers] = useState<RoomMemberRow[]>([]);
  useEffect(() => {
    if (!membersData) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMembers(
      membersData.roomMembers
        .map((member) =>
          member.user.id === currentUserId
            ? { ...member, isOnline: true }
            : member,
        )
        .sort((a, b) => {
          if (a.role !== b.role) return a.role === "OWNER" ? -1 : 1;
          return a.user.username.localeCompare(b.user.username);
        }),
    );
  }, [membersData, currentUserId]);

  function setMemberOnline(userId: string, online: boolean) {
    setMembers((prev) =>
      prev.map((m) => (m.user.id === userId ? { ...m, isOnline: online } : m)),
    );
  }

  return {
    members,
    membersLoaded: !!membersData,
    refetchMembers,
    setMemberOnline,
  };
}
