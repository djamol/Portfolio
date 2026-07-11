/**
 * IGNORE_PLATFORM=PLOT,RealEstate
 * Comma-separated platform names excluded by default from charts/tables
 * unless the user explicitly selects platforms.
 */

function normalizePlatformKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function parseIgnorePlatforms(raw = process.env.IGNORE_PLATFORM) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return [];
  }
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function getIgnorePlatforms() {
  return parseIgnorePlatforms();
}

function getIgnorePlatformKeys() {
  return [...new Set(getIgnorePlatforms().map(normalizePlatformKey).filter(Boolean))];
}

function isIgnoredPlatform(name) {
  const key = normalizePlatformKey(name);
  if (!key) return false;
  return getIgnorePlatformKeys().includes(key);
}

/**
 * SQL expression that normalizes website_app_name for ignore matching.
 * Example: "Real Estate" / "RealEstate" / "real_estate" → "realestate"
 */
function normalizePlatformSqlExpr(columnExpr) {
  return `REPLACE(REPLACE(REPLACE(LOWER(${columnExpr}), ' ', ''), '-', ''), '_', '')`;
}

/**
 * Append NOT IN clause for ignored platforms when no explicit platform filter is set.
 * Returns true if a clause was added.
 */
function appendIgnorePlatformClause(clauses, params, columnExpr = 'website_app_name') {
  const keys = getIgnorePlatformKeys();
  if (!keys.length) return false;
  const expr = normalizePlatformSqlExpr(columnExpr);
  clauses.push(`${expr} NOT IN (${keys.map(() => '?').join(', ')})`);
  params.push(...keys);
  return true;
}

module.exports = {
  normalizePlatformKey,
  parseIgnorePlatforms,
  getIgnorePlatforms,
  getIgnorePlatformKeys,
  isIgnoredPlatform,
  normalizePlatformSqlExpr,
  appendIgnorePlatformClause
};
