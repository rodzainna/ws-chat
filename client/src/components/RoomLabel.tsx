import { LockIcon } from "lucide-react";

export function RoomLabel({
  isPrivate,
  name,
}: {
  isPrivate: boolean;
  name: string;
}) {
  return (
    <>
      {isPrivate ? <LockIcon className="inline size-3 align-middle" /> : "#"}{" "}
      {name}
    </>
  );
}
