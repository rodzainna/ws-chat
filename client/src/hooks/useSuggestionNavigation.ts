import { useState } from "react";

export function useSuggestionNavigation(itemCount: number) {
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  function moveDown() {
    setHighlightedIndex((i) => (itemCount === 0 ? 0 : (i + 1) % itemCount));
  }
  function moveUp() {
    setHighlightedIndex((i) =>
      itemCount === 0 ? 0 : (i - 1 + itemCount) % itemCount,
    );
  }

  return { highlightedIndex, setHighlightedIndex, moveDown, moveUp };
}
