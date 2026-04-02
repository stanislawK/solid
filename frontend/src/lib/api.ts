const SESSION_EXPIRED_EVENT = 'auth:session-expired'
const CSRF_COOKIE_NAME = 'solid_csrf_token'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

type ApiFetchOptions = {
  notifyOnUnauthorized?: boolean
  retryOnUnauthorized?: boolean
}

let refreshPromise: Promise<boolean> | null = null

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input
  }

  if (input instanceof URL) {
    return input.toString()
  }

  return input.url
}

function getCookie(name: string) {
  const prefix = `${name}=`

  for (const part of document.cookie.split('; ')) {
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length))
    }
  }

  return null
}

function appendCsrfHeader(headers: Headers, method: string) {
  if (SAFE_METHODS.has(method) || headers.has('X-CSRF-Token')) {
    return
  }

  const csrfToken = getCookie(CSRF_COOKIE_NAME)
  if (csrfToken) {
    headers.set('X-CSRF-Token', csrfToken)
  }
}

function isRefreshRequest(input: RequestInfo | URL) {
  return getRequestUrl(input).includes('/api/auth/refresh')
}

function notifySessionExpired() {
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
}

export async function refreshAuthSession() {
  if (refreshPromise) {
    return refreshPromise
  }

  refreshPromise = (async () => {
    const headers = new Headers()
    appendCsrfHeader(headers, 'POST')

    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers,
      credentials: 'include',
    })

    if (!response.ok) {
      notifySessionExpired()
      return false
    }

    return true
  })().finally(() => {
    refreshPromise = null
  })

  return refreshPromise
}

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: ApiFetchOptions = {}
) {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  appendCsrfHeader(headers, method)

  const response = await fetch(input, {
    ...init,
    headers,
    credentials: 'include',
  })

  if (
    response.status === 401 &&
    options.retryOnUnauthorized !== false &&
    !isRefreshRequest(input)
  ) {
    const refreshed = await refreshAuthSession()
    if (refreshed) {
      const retryHeaders = new Headers(init.headers)
      appendCsrfHeader(retryHeaders, method)
      return fetch(input, {
        ...init,
        headers: retryHeaders,
        credentials: 'include',
      })
    }
  }

  if (
    response.status === 401 &&
    options.notifyOnUnauthorized !== false &&
    !isRefreshRequest(input)
  ) {
    notifySessionExpired()
  }

  return response
}

export { SESSION_EXPIRED_EVENT }