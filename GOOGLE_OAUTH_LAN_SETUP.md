# Google OAuth LAN Setup - IMPORTANT!

## ⚠️ CRITICAL: Add LAN Redirect URI to Google OAuth

After making the code changes, you **MUST** update your Google OAuth settings to whitelist the LAN IP redirect URI.

### Steps:

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/apis/credentials
   - Or search for "Google Cloud Console credentials"

2. **Select your OAuth 2.0 Client**
   - Find your client ID: `367556225135-3oks7p52e2t3ruf1afgmu5kij3glieqo.apps.googleusercontent.com`
   - Click on it to edit

3. **Add Authorized Redirect URIs**
   
   You need **BOTH** of these redirect URIs:
   
   ```
   http://localhost:8000/auth/callback
   http://10.10.36.36:8000/auth/callback
   ```
   
   - The first one (localhost) is for when YOU access the app locally
   - The second one (LAN IP) is for when COLLEAGUES access via WiFi

4. **Save Changes**
   - Click "Save" at the bottom
   - Wait 5-10 seconds for changes to propagate

### How It Works Now

**Before (Broken):**
- Colleague at `10.10.36.21` accesses `http://10.10.36.36:5173`
- Clicks login → Google OAuth starts
- Google redirects to `http://localhost:8000/auth/callback` ❌ (doesn't exist on colleague's machine)
- Login fails with "400 Bad Request"

**After (Fixed):**
- Colleague at `10.10.36.21` accesses `http://10.10.36.36:5173`
- Clicks login → Google OAuth starts
- Backend detects request came from `10.10.36.36` (using `request.headers.get("host")`)
- Google redirects to `http://10.10.36.36:8000/auth/callback` ✅
- Backend receives OAuth code and completes login
- Colleague is now logged in!

### Testing Checklist

After updating Google OAuth settings:

- [ ] **Test 1: Host (You) - Localhost**
  - Access: `http://localhost:5173`
  - Click login → Should redirect to Google → Back to `http://localhost:8000/auth/callback`
  - Should work ✅

- [ ] **Test 2: Host (You) - LAN IP**
  - Access: `http://10.10.36.36:5173`
  - Click login → Should redirect to Google → Back to `http://10.10.36.36:8000/auth/callback`
  - Should work ✅

- [ ] **Test 3: Colleague - LAN IP**
  - Colleague accesses: `http://10.10.36.36:5173` (from their computer at `10.10.36.21`)
  - Click login → Should redirect to Google → Back to `http://10.10.36.36:8000/auth/callback`
  - Should work ✅

### Troubleshooting

**If login still fails:**

1. **Check Google OAuth Console**
   - Ensure BOTH redirect URIs are saved
   - Wait 5-10 seconds after saving

2. **Check Backend Logs**
   - Look for: `>>> redirect_uri (dynamic) = http://10.10.36.36:8000/auth/callback`
   - If it shows `localhost`, the code didn't update properly

3. **Check Browser Console**
   - Look for CORS errors
   - Look for cookie errors

4. **Fallback: Cookie Sharing Method**
   - If OAuth still problematic, use the cookie sharing method from `HYBRID_LAN_GUIDE.md`
   - You login on localhost → Share cookie value with colleagues

### Notes

- Google OAuth may still show warnings for non-https URIs (expected for local dev)
- Cookies are set with `samesite=lax` to work across localhost and LAN IP
- Session duration: 24 hours (max_age=86400)
- No need to restart backend/frontend after Google OAuth settings update

### What Changed in Code

**`server/auth.py` - Line 26-34:**
```python
# OLD (hard-coded):
redirect_uri = settings.backend_url.rstrip("/") + "/auth/callback"

# NEW (dynamic):
request_host = request.headers.get("host") or "localhost:8000"
if not request_host.startswith("http"):
    redirect_uri = f"http://{request_host}/auth/callback"
else:
    redirect_uri = f"{request_host}/auth/callback"
```

Now the redirect URI matches wherever the request came from!
