export function renderContentWithMentions(
  content: string,
  mentionedUsernames: string[],
) {
  if (mentionedUsernames.length === 0) return content;
  const pattern = new RegExp(
    `(?<![a-z0-9_])@(${mentionedUsernames.join("|")})\\b`,
    "gi",
  );
  return content.split(pattern).map((part, index) =>
    index % 2 === 1 ? (
      <span
        key={index}
        className="rounded bg-amber-400 px-1 font-medium text-amber-950"
      >
        @{part}
      </span>
    ) : (
      part
    ),
  );
}
