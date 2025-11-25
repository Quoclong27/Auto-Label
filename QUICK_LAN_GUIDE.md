# 🚀 Quick LAN Access Guide - Cookie Sharing Method

## ⚠️ Google OAuth Limitation
Google OAuth **does NOT accept private IP addresses** like `10.10.36.36` as redirect URIs.  
Only accepts: `localhost`, `127.0.0.1`, or public domains (`.com`, `.org`, etc.)

## ✅ Simplest Solution: Cookie Sharing

### Step 1: Host (You) - Login First
1. Start servers:
   ```powershell
   .\run_backend.ps1   # Terminal 1
   .\run_frontend.ps1  # Terminal 2
   ```

2. Open browser: `http://localhost:5173`
3. Click "Sign in with Google" → Login with @fpt.edu.vn
4. ✅ You're logged in!

### Step 2: Get Cookie Value
1. Press `F12` (DevTools)
2. Go to: **Application** tab → **Cookies** → `http://localhost:5173`
3. Find cookie named: `user_email`
4. Copy its **Value** (e.g., `longtqse172269@fpt.edu.vn`)

### Step 3: Share with Colleagues

**Send them this info:**
```
App URL: http://10.10.36.36:5173
Cookie value: longtqse172269@fpt.edu.vn  (your email)
```

### Step 4: Colleague - Apply Cookie

1. Open browser: `http://10.10.36.36:5173`
2. Press `F12` → Go to **Console** tab
3. Paste this command (replace EMAIL with the value you got):
   ```javascript
   document.cookie = "user_email=longtqse172269@fpt.edu.vn; path=/; max-age=86400"
   ```
4. Press `Enter`
5. **Refresh the page** (`Ctrl+R`)
6. ✅ They're logged in as you!

### Notes

- **Security**: All colleagues will be logged in as the same user (you)
- **Duration**: Cookie lasts 24 hours, then needs to be reapplied
- **Why it works**: OAuth only validates during login. Once cookie is set, backend accepts it from any IP

## Alternative: Dev Login Endpoint

If you want each colleague to have their own account:

### 1. Enable Dev Mode

Add to `server/.env`:
```
DEV_OAUTH_PERMISSIVE=1
```

Restart backend.

### 2. Colleague Login

Each colleague runs this command (replace EMAIL):
```powershell
curl -X POST "http://10.10.36.36:8000/auth/dev-login?email=colleague@fpt.edu.vn"
```

Or they can open in browser:
```
http://10.10.36.36:8000/auth/dev-login?email=colleague@fpt.edu.vn
```

This creates a session and redirects to frontend.

### 3. Make User Admin (Optional)

If you want colleague to be admin, add their email to `server/.env`:
```
ADMIN_EMAIL=colleague@fpt.edu.vn
```

## Comparison

| Method | Pros | Cons |
|--------|------|------|
| **Cookie Sharing** | ✅ No setup<br>✅ Works immediately<br>✅ No server changes | ❌ Everyone same user<br>❌ Must reapply every 24hrs |
| **Dev Login** | ✅ Each user separate account<br>✅ Can assign admin | ❌ Need DEV_OAUTH_PERMISSIVE=1<br>❌ Manual login per user |
| **SSH Tunnel** | ✅ Real OAuth login<br>✅ Separate accounts | ❌ Need SSH server<br>❌ Complex setup |

## Recommended

**For quick demo/testing**: Use **Cookie Sharing**  
**For daily work**: Use **Dev Login Endpoint**  
**For production**: Deploy to server with public domain

