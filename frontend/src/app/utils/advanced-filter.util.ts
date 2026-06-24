export function matchesMultiSelect(selected: string[], value: string | null | undefined): boolean {
  if (!selected.length) {
    return true;
  }
  return !!value && selected.includes(value);
}

export function pruneSelections(selected: string[], available: string[]): string[] {
  return selected.filter(value => available.includes(value));
}

export function hasMultiSelectFilter(selected: string[]): boolean {
  return selected.length > 0;
}
