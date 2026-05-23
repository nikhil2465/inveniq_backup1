/**
 * Authentication utilities — token storage, user access, and global fetch interceptor.
 * Central place for all auth state so no component touches localStorage directly.
 */

const TOKEN_KEY         = 'inveniq_token';
const USER_KEY          = 'inveniq_user';
const REFRESH_TOKEN_KEY = 'inveniq_refresh_token';

// Module-level reference to the unpatched fetch — set once in installFetchInterceptor.
// refreshAccessToken() uses this directly so it never goes through the patched fetch
// (which would cause infinite refresh loops if the refresh endpoint returned 401).
let _originalFetch = null;

// In-flight refresh promise — prevents concurrent refresh races.
// Multiple /api/* calls arriving at the same instant share one refresh attempt.
let _refreshPromise = null;

// ── Storage ────────────────────────────────────────────────────────────────────

export function setAuth(token, user, refreshToken = null) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || null;
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY) || null;
}

export function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isAuthenticated() {
  const token = getToken();
  if (!token) return false;
  try {
    // Decode payload (no verify — server verifies); check exp client-side
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

/**
 * Returns the allowed module list from the JWT, or null if the user has unrestricted access.
 * null       → admin / "all" access (show everything)
 * string[]   → restricted client (show only listed modules)
 */
export function getAllowedModules() {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const modules = payload.allowed_modules;
    if (!modules || modules === 'all') return null;
    return typeof modules === 'string'
      ? modules.split(',').map(m => m.trim()).filter(Boolean)
      : Array.isArray(modules) ? modules : null;
  } catch {
    return null;
  }
}

// ── Token lifecycle ────────────────────────────────────────────────────────────

/** Returns seconds until the stored access token expires. Negative = already expired. */
function _tokenSecondsLeft() {
  const token = getToken();
  if (!token) return -9999;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp - Math.floor(Date.now() / 1000);
  } catch {
    return -9999;
  }
}

/**
 * Silently refresh the access token using the stored refresh token.
 * Concurrent calls share a single in-flight promise — no double-refresh races.
 * Returns true on success, false on failure.
 * On auth failure (refresh token expired/revoked): clears auth storage.
 * On network error: returns false without clearing — server 401 will catch it.
 */
export async function refreshAccessToken() {
  if (_refreshPromise) return _refreshPromise;

  const refreshToken = getRefreshToken();
  if (!refreshToken || !_originalFetch) return false;

  _refreshPromise = (async () => {
    try {
      const resp = await _originalFetch('/api/auth/refresh', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!resp.ok) {
        // Refresh endpoint rejected the token (expired, revoked, tampered)
        clearAuth();
        return false;
      }

      const data = await resp.json();
      const user = getUser();
      // Update stored tokens; user object keeps its existing shape
      setAuth(data.access_token, user ?? {}, data.refresh_token ?? null);
      return true;
    } catch {
      // Network error — don't clear auth; server 401 handles truly-expired tokens
      return false;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

// ── Global fetch interceptor ───────────────────────────────────────────────────
// Patches window.fetch once on app startup.
// For every /api/* request (except /api/auth/*):
//   1. Proactively refreshes the access token when < 5 minutes remain.
//   2. Injects the Bearer token into the request headers.
//   3. On 401 response: attempts one silent refresh + retry.
//      If the retry also 401s, clears auth and signals App.js to show the login screen.

let _interceptorInstalled = false;

export function installFetchInterceptor() {
  if (_interceptorInstalled) return;
  _interceptorInstalled = true;

  _originalFetch = window.fetch.bind(window);

  window.fetch = async function patchedFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url ?? '';

    if (url.startsWith('/api/') && !url.startsWith('/api/auth/')) {
      // Proactive refresh: if the token expires within 5 minutes, refresh before sending
      const secsLeft = _tokenSecondsLeft();
      if (secsLeft < 300) {
        await refreshAccessToken();
      }

      const token = getToken();
      if (token) {
        init = {
          ...init,
          headers: {
            ...init.headers,
            Authorization: `Bearer ${token}`,
          },
        };
      }
    }

    const response = await _originalFetch(input, init);

    // On 401: try one silent refresh + retry with the new token
    if (response.status === 401 && url.startsWith('/api/') && !url.startsWith('/api/auth/')) {
      const refreshed = await refreshAccessToken();

      if (refreshed) {
        const newToken = getToken();
        const retryInit = {
          ...init,
          headers: {
            ...init.headers,
            ...(newToken ? { Authorization: `Bearer ${newToken}` } : {}),
          },
        };
        return _originalFetch(input, retryInit);
      }

      // Refresh failed — clear any remaining auth state and signal App.js
      clearAuth();
      window.dispatchEvent(new CustomEvent('inveniq:auth-expired'));
    }

    return response;
  };
}
