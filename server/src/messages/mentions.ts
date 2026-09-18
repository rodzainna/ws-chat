const MENTION_PATTERN = /@([a-z0-9_]{3,20})\b/gi;

export function extractMentionedUsernames(content: string): string[] {
  const usernames = new Set<string>();
  for (const match of content.matchAll(MENTION_PATTERN)) {
    usernames.add(match[1].toLowerCase());
  }
  return [...usernames];
}
