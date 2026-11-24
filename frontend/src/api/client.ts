export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: any;
}

/**
 * API client reusing the existing auth headers and session storage.
 */
export async function apiFetch<T = any>(endpoint: string, options: ApiFetchOptions = {}): Promise<T> {
  const token = sessionStorage.getItem('ss_token') || localStorage.getItem('ss_token');
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // If body is object, serialize as JSON
  let body = options.body;
  if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof URLSearchParams)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  const res = await fetch(endpoint, {
    ...options,
    headers,
    body,
  });

  if (res.status === 401) {
    if (!endpoint.includes('/login')) {
      sessionStorage.removeItem('ss_token');
      sessionStorage.removeItem('ss_user');
      localStorage.removeItem('ss_token');
      localStorage.removeItem('ss_user');
      window.dispatchEvent(new Event('auth-unauthorized'));
      throw new Error('Authentication required');
    }
    let errDetail = 'Invalid username or password';
    try {
      const errJson = await res.json();
      errDetail = errJson.detail || errJson.message || errDetail;
    } catch {
      // ignore parse failure
    }
    throw new Error(errDetail);
  }

  if (!res.ok) {
    let errDetail = 'Request failed';
    try {
      const errJson = await res.json();
      errDetail = errJson.detail || errJson.message || JSON.stringify(errJson);
    } catch {
      errDetail = await res.text();
    }
    throw new Error(errDetail || `Error ${res.status}`);
  }

  // Check if response is JSON
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res.text() as unknown as T;
}

/**
 * Downloads a file from the given URL using the Bearer token for auth.
 * Creates an object URL and triggers a hidden <a download> click.
 * Dispatches 'download-toast' CustomEvents for success/error feedback.
 */
export async function downloadFile(url: string, filename: string): Promise<void> {
  const token = sessionStorage.getItem('ss_token') || localStorage.getItem('ss_token');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  window.dispatchEvent(
    new CustomEvent('download-toast', { detail: { msg: 'Downloading…', type: 'info' } })
  );

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      let detail = `Error ${res.status}`;
      try {
        const j = await res.json();
        detail = j.detail || j.message || detail;
      } catch {
        // ignore parse failure
      }
      window.dispatchEvent(
        new CustomEvent('download-toast', { detail: { msg: `Download failed: ${detail}`, type: 'error' } })
      );
      throw new Error(detail);
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
  } catch (err: any) {
    // Only dispatch if it wasn't already dispatched above
    if (!err.message?.startsWith('Error ')) {
      window.dispatchEvent(
        new CustomEvent('download-toast', { detail: { msg: `Download failed: ${err.message}`, type: 'error' } })
      );
    }
    throw err;
  }
}
