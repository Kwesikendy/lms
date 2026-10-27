let authToken: string | null =
  typeof window !== 'undefined' ? window.localStorage.getItem('aether_token') : null;

export function setClientAuthToken(token: string | null) {
  authToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      window.localStorage.setItem('aether_token', token);
    } else {
      window.localStorage.removeItem('aether_token');
    }
  }
}

export function getClientAuthToken(): string | null {
  return authToken;
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (authToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }

  const res = await fetch(endpoint, {
    ...options,
    headers,
    credentials: 'include',
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const errMsg =
      typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error: unknown }).error)
        : `Request failed with status ${res.status}`;
    throw Object.assign(new Error(errMsg), { status: res.status, data });
  }

  return data as T;
}

/** Upload JSON with real byte-level progress (fetch cannot report upload progress). */
export function apiUploadJson<T = unknown>(
  endpoint: string,
  body: unknown,
  onProgress: (percent: number) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (authToken) xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new Error('Network error while uploading. Check your connection and retry.'));
    xhr.onabort = () => reject(new Error('Upload cancelled.'));
    xhr.onload = () => {
      let data: unknown = {};
      try {
        data = JSON.parse(xhr.responseText || '{}');
      } catch {
        // non-JSON response
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as T);
      } else {
        const msg =
          typeof data === 'object' && data !== null && 'error' in data
            ? String((data as { error: unknown }).error)
            : `Upload failed (${xhr.status}).`;
        reject(new Error(msg));
      }
    };
    xhr.send(JSON.stringify(body));
  });
}

export function formatCurrency(amount: number, currency = 'GHS'): string {
  const num = Number(amount || 0);
  if (num === 0) return 'Free';
  const hasFraction = Math.abs(num - Math.round(num)) > 0.001;
  return `${currency} ${num.toLocaleString('en-GH', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function dateParts(iso: string) {
  const d = new Date(iso);
  return {
    month: d.toLocaleString('en-GB', { month: 'short' }),
    day: d.getDate(),
    weekday: d.toLocaleString('en-GB', { weekday: 'short' }),
    time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  };
}

export function timeRange(startIso: string, endIso: string): string {
  const fmt = (v: string) =>
    new Date(v).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${fmt(startIso)} – ${fmt(endIso)}`;
}

/** Value for <input type="datetime-local"> in the user's local time zone. */
export function toLocalInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const timeZoneLabel: string =
  typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function firstName(full?: string | null): string {
  return (full || '').replace(/^(Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)\s+/i, '').split(' ')[0] || 'there';
}
