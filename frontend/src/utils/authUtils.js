/**
 * Authentication utilities — token storage, user access, and global fetch interceptor.
 * Central place for all auth state so no component touches localStorage directly.
 */

const TOKEN_KEY  = 'inveniq_token';
const USER_KEY   = 'inveniq_user';

// ── Storage ────────────────────────────────────────────────────────────────────

export function setAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || null;
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
 * null  → admin / "all" access (show everything)
 * string[] → restricted client (show only listed modules)
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

// ── Global fetch interceptor ───────────────────────────────────────────────────
// Patches window.fetch once: injects Bearer token on every /api/* request.
// Handles 401 by clearing auth + dispatching a custom event so App.js can re-render.

let _interceptorInstalled = false;

export function installFetchInterceptor() {
  if (_interceptorInstalled) return;
  _interceptorInstalled = true;

  const _originalFetch = window.fetch.bind(window);

  window.fetch = async function patchedFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url ?? '';

    // Only inject auth header for /api/* calls (skip external URLs)
    if (url.startsWith('/api/')) {
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

    // On 401 — clear auth and signal App.js to show login screen
    if (response.status === 401 && url.startsWith('/api/') && !url.startsWith('/api/auth/')) {
      clearAuth();
      window.dispatchEvent(new CustomEvent('inveniq:auth-expired'));
    }

    return response;
  };
}
