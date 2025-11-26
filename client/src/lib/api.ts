// Auto-detect backend URL based on how user accesses the frontend
function getBackendURL(): string {
  // Priority 1: Use environment variable if set (for production/staging)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }
  
  // Priority 2: Auto-detect based on hostname
  const hostname = window.location.hostname
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // Local development - use localhost backend
    return 'http://localhost:8000'
  } else if (hostname.includes('vercel.app')) {
    // Deployed on Vercel - use Railway production backend
    return 'https://auto-label-production.up.railway.app'
  } else {
    // LAN access - use same IP for backend (e.g., 10.10.36.36:8000)
    return `http://${hostname}:8000`
  }
}

export const API = getBackendURL()

// Get auth email from URL or localStorage
function getAuthEmail(): string | null {
  // Check URL parameter first (from OAuth redirect)
  const params = new URLSearchParams(window.location.search)
  const emailFromUrl = params.get('auth_email')
  if (emailFromUrl) {
    // Store in localStorage for subsequent requests
    localStorage.setItem('auth_email', emailFromUrl)
    return emailFromUrl
  }
  
  // Fallback to localStorage
  return localStorage.getItem('auth_email')
}

export async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const authEmail = getAuthEmail()
  
  // Add auth_email to URL for production cross-domain auth
  let url = `${API}${path}`
  if (authEmail && !path.includes('auth_email=')) {
    const separator = path.includes('?') ? '&' : '?'
    url = `${API}${path}${separator}auth_email=${encodeURIComponent(authEmail)}`
  }
  
  const res = await fetch(url, {
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