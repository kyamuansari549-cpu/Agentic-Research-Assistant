"""
Transactional email tool -- currently just the first-login welcome email.

Uses Resend (https://resend.com) because its free tier (3000 emails/month,
100/day) needs nothing more than an API key -- no SMTP app-password setup,
no domain verification required to get started (Resend's shared
onboarding@resend.dev sender works immediately for testing/small projects).

If RESEND_API_KEY isn't set, sending is silently skipped rather than
raising -- a missing email key should never break login.
"""
import httpx
from app.config import settings

RESEND_URL = "https://api.resend.com/emails"


def send_welcome_email(to_email: str, name: str) -> None:
    if not settings.resend_api_key:
        print("[email] RESEND_API_KEY not set -- skipping welcome email", flush=True)
        return

    first_name = (name or "there").split(" ")[0]

    html_body = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Welcome, {first_name}! 👋</h2>
      <p>
        Thanks for signing in to <strong>Agentic Research &amp; Report Assistant</strong>.
        You can now ask any research question and a team of five AI agents
        (Planner, Researcher, Coder, Writer, and Critic) will plan, research,
        analyze, write, and self-review a full report for you.
      </p>
      <p>Give it a try with your first question!</p>
    </div>
    """

    try:
        response = httpx.post(
            RESEND_URL,
            headers={
                "Authorization": f"Bearer {settings.resend_api_key}",
                "Content-Type": "application/json",
            },
            json={
                # Resend's shared test sender -- works without verifying your
                # own domain. Swap to a verified "you@yourdomain.com" address
                # later if you want your own domain in the "From" field.
                "from": "Agentic Research Assistant <onboarding@resend.dev>",
                "to": [to_email],
                "subject": "Welcome to Agentic Research Assistant!",
                "html": html_body,
            },
            timeout=10,
        )
        if response.status_code >= 400:
            print(f"[email] Resend error {response.status_code}: {response.text}", flush=True)
    except Exception as exc:  # noqa: BLE001
        # Never let an email failure break the login flow.
        print(f"[email] failed to send welcome email: {exc}", flush=True)
