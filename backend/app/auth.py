"""
Google OAuth login + stateless JWT sessions.

Flow:
  1. Frontend links to GET /auth/login
  2. We redirect to Google's consent screen
  3. Google redirects back to GET /auth/callback with a code
  4. We exchange it for the user's profile, upsert a local user row,
     and issue our own JWT
  5. We redirect to the frontend with ?token=<jwt> in the URL
  6. Frontend stores the token (localStorage) and sends it as
     `Authorization: Bearer <token>` on every API call afterwards.

EventSource (used for the SSE stream) can't set custom headers, so
the stream endpoint accepts the token as a `?token=` query param too
-- see get_current_user_from_token().
"""
from datetime import datetime, timedelta, timezone

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt

from app.config import settings
from app.db import upsert_user, get_user_by_id
from app.tools.email import send_welcome_email

router = APIRouter(prefix="/auth", tags=["auth"])

oauth = OAuth()
oauth.register(
    name="google",
    client_id=settings.google_client_id,
    client_secret=settings.google_client_secret,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)

ALGORITHM = "HS256"


def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode(
        {"sub": user_id, "exp": expire}, settings.jwt_secret, algorithm=ALGORITHM
    )


def _decode_token(token: str) -> str:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user_id


def get_current_user(request: Request) -> dict:
    """Dependency for normal REST endpoints -- reads the Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = _decode_token(auth_header.removeprefix("Bearer ").strip())
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def get_current_user_from_query_or_header(request: Request) -> dict:
    """Dependency for the SSE stream endpoint, which EventSource can't
    attach custom headers to -- falls back to a `?token=` query param."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.removeprefix("Bearer ").strip()
    else:
        token = request.query_params.get("token", "")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = _decode_token(token)
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@router.get("/login")
async def login(request: Request):
    redirect_uri = f"{settings.backend_url}/auth/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/callback")
async def callback(request: Request):
    token = await oauth.google.authorize_access_token(request)
    userinfo = token.get("userinfo") or {}
    if not userinfo.get("sub"):
        raise HTTPException(status_code=400, detail="Google login failed")

    user = upsert_user(
        google_sub=userinfo["sub"],
        email=userinfo.get("email", ""),
        name=userinfo.get("name", ""),
        picture=userinfo.get("picture", ""),
    )

    # Fire the welcome email only on a user's very first login ever --
    # upsert_user tells us this via is_new_user so repeat logins never
    # re-trigger it. Never let an email hiccup block/break login: any
    # failure inside send_welcome_email is caught and logged internally,
    # not raised here.
    if user.get("is_new_user"):
        send_welcome_email(to_email=user["email"], name=user["name"])

    jwt_token = create_access_token(user["id"])
    return RedirectResponse(f"{settings.frontend_url}/?token={jwt_token}")


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "picture": user["picture"],
    }
