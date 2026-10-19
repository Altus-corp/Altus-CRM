type ContainmentRoot = { contains(target: Node | null): boolean } | null;

export function shouldCloseColumnChooser(target: EventTarget | null, dialog: ContainmentRoot, trigger: ContainmentRoot, dragInProgress: boolean) {
  if (dragInProgress) return false;
  const node = target as Node | null;
  return !dialog?.contains(node) && !trigger?.contains(node);
}

export function isColumnChooserEscape(key: string) {
  return key === "Escape";
}
