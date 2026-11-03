"""Owner-only: set a new password for someone who has forgotten theirs.

There is no "forgot password" email. Whoever can run this has the database address (DATABASE_URL),
which is a secret kept in Render and never given to users, so only the owner can use it.

    python -m backend.scripts.reset_password someone@example.com

It asks for the new password twice at a prompt, so the password never appears on the command line or
in shell history. It saves the password scrambled, signs the person out of every device, and clears
any sign-in lockout. It prints a user ID only, never the email or the password.
"""
import argparse
import getpass
import sys
from typing import List, Optional

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from backend.auth import MAX_PASSWORD, MIN_PASSWORD, hash_password, normalize_email
from backend.db import make_engine
from backend.models import LoginFailure, User, UserSession
from backend.settings import get_settings


class InvalidPassword(ValueError):
    pass


def reset_password(engine, email: str, new_password: str) -> Optional[str]:
    """Set the password for `email`. Returns the user's ID, or None if there is no such account."""
    if not MIN_PASSWORD <= len(new_password) <= MAX_PASSWORD:
        raise InvalidPassword(f"The password must be {MIN_PASSWORD} to {MAX_PASSWORD} characters.")
    email = normalize_email(email)
    with Session(engine) as db:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            return None
        user.password_hash = hash_password(new_password)
        db.execute(delete(UserSession).where(UserSession.user_id == user.id))
        db.execute(delete(LoginFailure).where(LoginFailure.email == email))
        db.commit()
        return user.id


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Reset a forgotten password (owner only).")
    parser.add_argument("email", help="the account's email address")
    args = parser.parse_args(argv)

    database_url = get_settings().database_url
    if not database_url:
        print("DATABASE_URL is not set, so there is no database to change.", file=sys.stderr)
        return 2

    password = getpass.getpass("New password: ")
    if password != getpass.getpass("New password again: "):
        print("The two passwords did not match. Nothing was changed.", file=sys.stderr)
        return 1
    engine = make_engine(database_url)
    try:
        user_id = reset_password(engine, args.email, password)
    except InvalidPassword as error:
        print(f"{error} Nothing was changed.", file=sys.stderr)
        return 1
    except Exception as error:  # an invalid email address, or the database being unreachable
        print(f"Could not reset the password ({type(error).__name__}). Nothing was changed.", file=sys.stderr)
        return 1
    finally:
        engine.dispose()
    if user_id is None:
        print("There is no account with that email. Nothing was changed.", file=sys.stderr)
        return 1
    print(f"Password reset for user {user_id}. All of their sessions were ended.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
