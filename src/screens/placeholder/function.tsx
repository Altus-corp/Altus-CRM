export type PlaceholderCopy = { title: string; note: string };

export function usePlaceholderScreen(copy: PlaceholderCopy) {
  const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date());
  return { ...copy, dateLabel };
}
