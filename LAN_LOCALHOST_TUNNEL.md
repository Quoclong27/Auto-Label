# LAN Access via Localhost Tunneling

## Problem
Google OAuth doesn't accept private IPs like `10.10.36.36` - only accepts `localhost` or public domains.

## Solution: SSH Tunneling

### For Host (You):
Keep servers running normally:
```powershell
.\run_backend.ps1   # Backend on 0.0.0.0:8000
.\run_frontend.ps1  # Frontend on 0.0.0.0:5173
```

### For Colleagues (Same WiFi):

Each colleague needs to set up port forwarding from YOUR machine to THEIR localhost:

**Option A: Using SSH (if you have SSH server on Windows)**

On colleague's machine:
```bash
ssh -L 8000:localhost:8000 -L 5173:localhost:5173 YOUR_USERNAME@10.10.36.36
```

Then access: `http://localhost:5173` (on their machine, but connects to your server)

**Option B: Using netsh (Windows built-in)**

Run as Administrator on YOUR machine (once per colleague):
```powershell
# Allow colleague at 10.10.36.21 to tunnel
netsh interface portproxy add v4tov4 listenaddress=10.10.36.36 listenport=8000 connectaddress=127.0.0.1 connectport=8000
netsh interface portproxy add v4tov4 listenaddress=10.10.36.36 listenport=5173 connectaddress=127.0.0.1 connectport=5173
```

**Option C: Simplest - Use Cookie Sharing**

This bypasses OAuth entirely:

1. **Host (you)** logs in on `localhost:5173`
2. Open DevTools (F12) → Application → Cookies
3. Copy value of `user_email` cookie
4. **Colleague** accesses `http://10.10.36.36:5173`
5. Open DevTools → Console, paste:
   ```javascript
   document.cookie = "user_email=EMAIL_HERE@fpt.edu.vn; path=/; max-age=86400"
   ```
6. Refresh page → Logged in!

### Why This Works

- Google OAuth only validates the redirect URI during login
- Once logged in, session cookie works from any IP
- Cookie sharing gives colleagues a valid session without going through OAuth

## Recommended Workflow

**For small team (2-3 people):**
- Use **Cookie Sharing** (Option C) - simplest, no setup needed

**For larger team:**
- Set up SSH server on your machine
- Colleagues use SSH tunneling
- They access via `localhost` on their machines

**For production:**
- Deploy to a server with public domain
- Use proper OAuth with HTTPS

## Alternative: Use Dev Login Endpoint

If you set `DEV_OAUTH_PERMISSIVE=1` in `server/.env`, you can use:

```powershell
curl -X POST "http://10.10.36.36:8000/auth/dev-login?email=colleague@fpt.edu.vn"
```

This creates a session without OAuth. Then colleague can access the app.

