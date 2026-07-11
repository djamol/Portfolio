export function normalizePlatformKey(name: string | null | undefined): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

export function isIgnoredPlatform(
  name: string | null | undefined,
  ignorePlatforms: string[]
): boolean {
  const key = normalizePlatformKey(name);
  if (!key || !ignorePlatforms?.length) {
    return false;
  }
  const ignoreKeys = new Set(ignorePlatforms.map(normalizePlatformKey).filter(Boolean));
  return ignoreKeys.has(key);
}

/**
 * Default view: hide IGNORE_PLATFORM rows.
 * Manual platform selection: show only selected (including ignored platforms if chosen).
 */
export function matchesPlatformFilter(
  platformName: string | null | undefined,
  selectedPlatforms: string[],
  ignorePlatforms: string[]
): boolean {
  if (selectedPlatforms.length) {
    return !!platformName && selectedPlatforms.includes(platformName);
  }
  return !isIgnoredPlatform(platformName, ignorePlatforms);
}
