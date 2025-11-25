// Auto-detect backend URL based on how user accesses the frontend
function getBackendURL(): string {
  // If accessing via LAN IP (e.g., 10.10.36.36:5173), use LAN IP for backend
  const hostname = window.location.hostname
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // Accessing via localhost - use localhost backend
    return import.meta.env.VITE_API_URL || 'http://localhost:8000'
  } else {
    // Accessing via LAN IP - use same IP for backend
    return `http://${hostname}:8000`
  }
}

export const API = getBackendURL()

export async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

/**
 * Retry fetching with exponential backoff
 * Useful for /me endpoint after OAuth redirect when cookie might not be set yet
 */
export async function apiWithRetry<T>(path: string, opts: RequestInit = {}, maxRetries = 3): Promise<T> {
  let lastError: Error | null = null
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await api<T>(path, opts)
    } catch (err) {
      lastError = err as Error
      console.warn(`❌ Attempt ${attempt + 1} failed:`, lastError.message)
      
      // Only retry on 401 (auth issues), not on other errors
      if (!lastError.message.includes('401') && attempt < maxRetries - 1) {
        // Wait before retry: 100ms, 200ms, etc
        await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)))
      } else if (attempt === maxRetries - 1) {
        break
      }
    }
  }
  
  throw lastError
}