export function normalizeApiDomain(domain: string): string {
  let normalized = domain.trim();
  if (!normalized) {
    return 'http://localhost:3000';
  }

  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `http://${normalized}`;
  }

  return normalized.replace(/\/+$/, '');
}

export function getApiDomain(): string {
  const stored = localStorage.getItem('apiDomain');
  if (stored) {
    return normalizeApiDomain(stored);
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost:3000';
}

export function getApiBaseUrl(): string {
  return `${getApiDomain()}/api`;
}
