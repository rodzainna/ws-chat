import { cn } from "@/lib/utils";
import type { SuggestionItem } from "@/lib/chat";

// shared by the @mention picker and "Add people". onMouseDown so the input's
// onBlur doesn't close the list before the click registers.
export function UsernameSuggestions({
  items,
  highlightedIndex,
  onSelect,
  position,
}: {
  items: SuggestionItem[];
  highlightedIndex: number;
  onSelect: (item: SuggestionItem) => void;
  position: "above" | "below";
}) {
  if (items.length === 0) return null;
  return (
    <ul
      className={cn(
        "absolute z-10 max-h-48 w-full overflow-y-auto rounded-md border bg-popover py-1 shadow-md",
        position === "above" ? "bottom-full mb-1" : "top-full mt-1",
      )}
    >
      {items.map((item, index) => (
        <li
          key={item.id}
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect(item);
          }}
          className={cn(
            "cursor-pointer px-3 py-1.5 text-sm",
            index === highlightedIndex ? "bg-muted" : "hover:bg-muted",
          )}
        >
          {item.username}
        </li>
      ))}
    </ul>
  );
}
