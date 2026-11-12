from __future__ import annotations

import smtplib
from email.message import EmailMessage

from app.core.config import settings


class EmailConfigurationError(RuntimeError):
    pass


def send_email(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
) -> None:
    if not settings.gmail_smtp_user or not settings.gmail_smtp_app_password:
        raise EmailConfigurationError(
            "Gmail SMTP is not configured. Set GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD."
        )

    from_email = settings.gmail_from_email or settings.gmail_smtp_user

    message = EmailMessage()
    message["From"] = from_email
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(text_body)
    if html_body:
        message.add_alternative(html_body, subtype="html")

    with smtplib.SMTP(settings.gmail_smtp_host, settings.gmail_smtp_port, timeout=20) as smtp:
        smtp.starttls()
        smtp.login(settings.gmail_smtp_user, settings.gmail_smtp_app_password)
        smtp.send_message(message)
