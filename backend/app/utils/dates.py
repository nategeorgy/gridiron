"""Date helpers shared across the API."""

from datetime import date

DAYS_PER_YEAR = 365.25


def age_in_years(birth_date: date | None, today: date | None = None) -> float | None:
    """Age to one decimal, or None without a birth date.

    Derived rather than stored: age is the only thing anyone reads a birth date for,
    and a stored age is wrong the day after it is written.
    """
    if birth_date is None:
        return None
    reference = today or date.today()
    return round((reference - birth_date).days / DAYS_PER_YEAR, 1)
