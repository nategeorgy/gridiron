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


settings = Settings()  # type: ignore[call-arg]
