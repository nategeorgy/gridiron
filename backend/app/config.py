"""Application configuration loaded from environment variables."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings sourced from the environment / backend/.env."""

    database_url: str
    environment: str = "development"
    # Comma-separated list of exact origins allowed to call the API (CORS).
    # In production, set this to the deployed frontend URL(s).
    cors_origins: str = "http://localhost:5173"
    # Regex of additional allowed origins, matched with a full match. Defaults to
    # this project's Vercel URLs so every preview deploy (e.g.
    # https://gridiron-git-<branch>-<scope>.vercel.app) and production are allowed
    # without listing each one. Override or clear via the CORS_ORIGIN_REGEX env var.
    cors_origin_regex: str = r"https://gridiron-[a-z0-9-]+\.vercel\.app"

    # --- Supabase Auth (M5) ---
    # The project URL, e.g. https://abcdefgh.supabase.co. Used to derive the token
    # issuer and the JWKS endpoint. Leave empty to run the API with accounts
    # disabled: every public endpoint keeps working and the /me endpoints return 503.
    supabase_url: str = ""
    # Only needed for projects still on legacy symmetric (HS256) JWT signing. Newer
    # Supabase projects sign asymmetrically and publish public keys at the JWKS
    # endpoint, which needs no secret here. See app/auth.py.
    supabase_jwt_secret: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse the comma-separated CORS origins into a list."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def cors_origin_regex_or_none(self) -> str | None:
        """The origin regex, or None when unset (so CORS falls back to the list).

        In development, any localhost port is also allowed: a second dev server (or a
        preview tool) is often assigned a free port rather than the default 5173, and
        blocking it looks exactly like a broken API. This never applies in production,
        where ENVIRONMENT is not "development".
        """
        pattern = self.cors_origin_regex.strip()
        if self.environment == "development":
            localhost = r"http://(localhost|127\.0\.0\.1):\d+"
            pattern = f"{pattern}|{localhost}" if pattern else localhost
        return pattern or None

    @property
    def auth_enabled(self) -> bool:
        """Whether account endpoints can verify a token.

        False until Supabase is configured, which keeps the whole public API usable
        on a fresh checkout with no Supabase project. Account endpoints then return
        503 ("accounts are not configured") instead of 401, so a missing env var
        never looks like a rejected login.
        """
        return bool(self.supabase_url.strip())

    @property
    def supabase_base_url(self) -> str:
        """The project URL without a trailing slash."""
        return self.supabase_url.strip().rstrip("/")

    @property
    def supabase_issuer(self) -> str:
        """The `iss` claim Supabase puts on tokens it signs."""
        return f"{self.supabase_base_url}/auth/v1"

    @property
    def supabase_jwks_url(self) -> str:
        """Where Supabase publishes the public keys for asymmetric verification."""
        return f"{self.supabase_base_url}/auth/v1/.well-known/jwks.json"


settings = Settings()  # type: ignore[call-arg]
