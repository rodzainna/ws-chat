import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UsernameSuggestions } from "@/components/chat/UsernameSuggestions";
import { useSuggestionNavigation } from "@/hooks/useSuggestionNavigation";
import type { RoomMemberRow, SuggestionItem } from "@/lib/chat";

// the message box plus its @mention picker. The draft text lives in the page
// (a rate-limited send puts it back), everything mention-related lives here.
export function MessageComposer({
  draft,
  onDraftChange,
  onSubmit,
  members,
}: {
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  members: RoomMemberRow[];
}) {
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const draftInputRef = useRef<HTMLInputElement>(null);
  const mentionCandidates = useMemo<SuggestionItem[]>(() => {
    if (mentionQuery === null) return [];
    const query = mentionQuery.toLowerCase();
    return members
      .filter((m) => m.user.username.toLowerCase().startsWith(query))
      .slice(0, 5)
      .map((m) => ({ id: m.user.id, username: m.user.username }));
  }, [members, mentionQuery]);
  const mentionNav = useSuggestionNavigation(mentionCandidates.length);

  function handleDraftChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    onDraftChange(value);
    const cursorPos = event.target.selectionStart ?? value.length;
    const match = value.slice(0, cursorPos).match(/(?:^|\s)@([a-z0-9_]*)$/i);
    mentionNav.setHighlightedIndex(0);
    setMentionQuery(match ? match[1] : null);
  }

  function selectMention(username: string) {
    const input = draftInputRef.current;
    const cursorPos = input?.selectionStart ?? draft.length;
    const before = draft
      .slice(0, cursorPos)
      .replace(/@[a-z0-9_]*$/i, `@${username} `);
    const after = draft.slice(cursorPos);
    onDraftChange(before + after);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(before.length, before.length);
    });
  }

  function handleDraftKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (mentionQuery === null || mentionCandidates.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      mentionNav.moveDown();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      mentionNav.moveUp();
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      selectMention(mentionCandidates[mentionNav.highlightedIndex].username);
    } else if (event.key === "Escape") {
      setMentionQuery(null);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2 border-t p-4">
      <div className="relative flex-1">
        <Input
          ref={draftInputRef}
          value={draft}
          onChange={handleDraftChange}
          onKeyDown={handleDraftKeyDown}
          onBlur={() => setMentionQuery(null)}
          placeholder="Message…"
          maxLength={2000}
        />
        <UsernameSuggestions
          items={mentionCandidates}
          highlightedIndex={mentionNav.highlightedIndex}
          onSelect={(item) => selectMention(item.username)}
          position="above"
        />
      </div>
      <Button type="submit">Send</Button>
    </form>
  );
}
