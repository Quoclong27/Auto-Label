# server/auth.py
import os, secrets
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse, JSONResponse
from authlib.integrations.starlette_client import OAuth
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from .models import User
from .deps import get_session, get_settings, Settings

router = APIRouter(prefix="/auth", tags=["auth"])

oauth = OAuth()
oauth.register(
    name="google",
    client_id=os.getenv("GOOGLE_CLIENT_ID"),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)

STATE_KEY = "oauth_google_state"

@router.get("/login")
async def login(
    request: Request, 
    settings: Settings = Depends(get_settings),
    session_obj: AsyncSession = Depends(get_session)
):
    # Check if DEV_OAUTH_PERMISSIVE is enabled
    if os.getenv("DEV_OAUTH_PERMISSIVE"):
        print("[DEV MODE] Bypassing Google OAuth, using admin email")
        email = settings.admin_email
        
        # Create or update user
        stmt = select(User).where(User.email == email)
        db_user = (await session_obj.execute(stmt)).scalars().first()
        
        if not db_user:
            db_user = User(
                email=email,
                name=email.split("@")[0],
                picture=None,
                is_admin=True,
            )
            session_obj.add(db_user)
        else:
            db_user.is_admin = True
        
        await session_obj.commit()
        
        # Get the Referer header to redirect back to where user came from
        referer = request.headers.get("referer")
        if referer:
            # Extract origin from referer (e.g., http://10.10.36.36:5173/login -> http://10.10.36.36:5173)
            from urllib.parse import urlparse
            parsed = urlparse(referer)
            frontend_origin = f"{parsed.scheme}://{parsed.netloc}"
        else:
            # Fallback to settings
            frontend_origin = settings.frontend_url
        
        resp = RedirectResponse(url=frontend_origin)
        resp.set_cookie("user_email", email, httponly=True, samesite="lax", secure=False, max_age=86400)
        print(f"✅ [DEV] Auto-logged in as: {email}, redirecting to: {frontend_origin}")
        return resp
    
    # Normal Google OAuth flow
    redirect_uri = settings.backend_url.rstrip("/") + "/auth/callback"
    state = secrets.token_urlsafe(32)
    request.session[STATE_KEY] = state
    print(">>> GOOGLE_CLIENT_ID =", os.getenv("GOOGLE_CLIENT_ID"))
    print(">>> redirect_uri =", redirect_uri)
    print(">>> /auth/login setting STATE =", state)

    return await oauth.google.authorize_redirect(
        request,
        redirect_uri,
        state=state,
        prompt="consent",
    )

@router.get("/callback")  # CHỈ "/callback" vì đã có prefix="/auth"
async def auth_callback(
    request: Request,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    print(">>> /auth/callback cookies:", request.cookies)
    print(">>> /auth/callback url:", str(request.url))
    print(">>> /auth/callback query:", dict(request.query_params))

    state_saved = request.session.get(STATE_KEY)
    state_param = request.query_params.get("state")
    code_param  = request.query_params.get("code")

    # Nếu callback trống (prefetch) → bỏ qua, KHÔNG xoá state
    if not state_param and not code_param:
        print("ℹ️ Empty callback (likely prefetch) -> ignore")
        return RedirectResponse(url=f"{settings.frontend_url}")

    if not state_param or state_param != state_saved:
        # Cho DEV fallback nếu mất state nhưng còn code (để bạn vào được)
        if code_param:
            print("⚠️ Missing/invalid state, DEV fallback with code.")
            # Dynamically determine redirect URI + try common variations
            request_host = request.headers.get("host") or "localhost:8000"
            if not request_host.startswith("http"):
                primary_redirect_uri = f"http://{request_host}/auth/callback"
            else:
                primary_redirect_uri = f"{request_host}/auth/callback"
            
            redirect_uris = [
                primary_redirect_uri,  # Use the request's host first
                settings.backend_url.rstrip("/") + "/auth/callback",
                "http://127.0.0.1:8000/auth/callback",
                "http://localhost:8000/auth/callback",
            ]
            
            token = None
            last_error = None
            
            for redirect_uri in redirect_uris:
                try:
                    print(f"  Trying redirect_uri: {redirect_uri}")
                    token = await oauth.google.fetch_access_token(
                        grant_type="authorization_code",
                        code=code_param,
                        redirect_uri=redirect_uri,
                    )
                    print(f"✅ TOKEN (fallback with {redirect_uri}):", token)
                    break
                except Exception as e:
                    print(f"  ❌ Failed with {redirect_uri}: {repr(e)}")
                    last_error = e
                    continue
            
            if not token:
                print("🚨 All fallback token attempts failed")
                raise HTTPException(400, f"OAuth error (fallback): {last_error}")
        else:
            raise HTTPException(400, "OAuth error: mismatching_state (precheck)")
    else:
        try:
            # authorize_access_token will use the redirect_uri from the session
            # (which was set during authorize_redirect with the dynamic URL)
            token = await oauth.google.authorize_access_token(request)
            print("✅ TOKEN:", token)
        except Exception as e:
            print("🚨 OAuth callback error:", repr(e))
            raise HTTPException(400, f"OAuth error: {e}")

    # Dọn state
    request.session.pop(STATE_KEY, None)

    userinfo = token.get("userinfo")
    if not userinfo:
        raise HTTPException(400, "Failed to get user info")

    email = userinfo["email"].lower()
    res = await session.execute(select(User).where(User.email == email))
    db_user = res.scalar_one_or_none()
    if not db_user:
        db_user = User(
            email=email,
            name=userinfo.get("name"),
            picture=userinfo.get("picture"),
            is_admin=(email == settings.admin_email),
        )
        session.add(db_user)
    else:
        db_user.name = userinfo.get("name")
        db_user.picture = userinfo.get("picture")
        db_user.is_admin = (email == settings.admin_email)
    await session.commit()

    print(f"✅ User created/updated: {email}, is_admin={db_user.is_admin}")
    
    # Instead of redirect with cookie, return to frontend with email in URL
    # Frontend will receive it and make subsequent /me requests with cookie
    resp = RedirectResponse(url=f"{settings.frontend_url}/?auth_email={email}")
    
    # Still set cookie for API calls
    resp.set_cookie(
        "user_email", 
        email, 
        httponly=True, 
        samesite="lax", 
        secure=False, 
        max_age=86400,  # 24 hours
        path="/",
    )
    print(f"📤 Redirecting to: {settings.frontend_url}/?auth_email={email}")
    return resp

@router.post("/dev-login")
async def dev_login(
    request: Request,
    email: str = "longtqse172269@fpt.edu.vn",
    session_obj: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    """
    Dev-only login endpoint - bypass Google OAuth
    Use: curl -X POST http://localhost:8000/auth/dev-login?email=user@example.com
    """
    if not os.getenv("DEV_OAUTH_PERMISSIVE"):
        raise HTTPException(403, "Dev login disabled. Set DEV_OAUTH_PERMISSIVE=1")
    
    print(f"[DEV] Logging in as {email}")
    
    # Create or update user
    stmt = select(User).where(User.email == email)
    db_user = (await session_obj.execute(stmt)).scalars().first()
    
    if not db_user:
        db_user = User(
            email=email,
            name=email.split("@")[0],
            picture=None,
            is_admin=(email == settings.admin_email),
        )
        session_obj.add(db_user)
    else:
        db_user.is_admin = (email == settings.admin_email)
    
    await session_obj.commit()
    
    resp = RedirectResponse(url=f"{settings.frontend_url}")
    resp.set_cookie("user_email", email, httponly=True, samesite="lax", secure=False, max_age=3600)
    return resp

@router.post("/logout")
async def logout(response: Response):
    resp = JSONResponse({"ok": True})
    resp.delete_cookie("user_email")
    return resp
