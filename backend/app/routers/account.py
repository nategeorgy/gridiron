"""Account endpoints (M5): league profiles, favorites, and saved views.

Every handler here is scoped to the user resolved from the verified bearer token.
**No endpoint accepts a user id as a parameter** — the id comes from the token and
nowhere else, so there is no request shape that reads another user's rows.

See docs/design/M5-accounts-saved-state.md §6.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Favorite, LeagueProfile, Player, SavedView, Team, User
from app.schemas.account import (
    AccountSummary,
    FavoriteOut,
    LeagueProfileCreate,
    LeagueProfileOut,
    LeagueProfileUpdate,
    SavedViewCreate,
    SavedViewOut,
    SavedViewUpdate,
    UserOut,
)
from app.schemas.player import PlayerOut

router = APIRouter(prefix="/me", tags=["account"])

# A soft ceiling on each collection. Not a product limit anyone should hit — it exists
# so a scripted client cannot grow one user's rows without bound.
MAX_PROFILES = 25
MAX_SAVED_VIEWS = 100
MAX_FAVORITES = 300


def _count(db: Session, model, user_id: UUID) -> int:
    """Count a user's rows in one of the owned tables."""
    return db.scalar(
        select(func.count()).select_from(model).where(model.user_id == user_id)
    )


# --- Account -----------------------------------------------------------------


@router.get("", response_model=AccountSummary)
def get_account(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> AccountSummary:
    """Return the signed-in user and what they have saved."""
    return AccountSummary(
        user=UserOut.model_validate(user),
        league_profile_count=_count(db, LeagueProfile, user.user_id),
        favorite_count=_count(db, Favorite, user.user_id),
        saved_view_count=_count(db, SavedView, user.user_id),
    )


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Response:
    """Delete the account and everything it owns.

    Present in the first release rather than as a follow-up: collecting a Google
    identity means owing the user a way to revoke it. Profiles, favorites, and saved
    views go with it via ON DELETE CASCADE. The Supabase auth record is separate and
    is removed by the user through Google/Supabase.
    """
    db.delete(user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- League profiles ---------------------------------------------------------


def _get_profile(db: Session, user_id: UUID, profile_id: UUID) -> LeagueProfile:
    """Fetch one of the user's profiles, or 404.

    Filtering on user_id as well as the primary key is what makes a guessed id
    useless: another user's profile is indistinguishable from one that does not exist.
    """
    profile = db.scalar(
        select(LeagueProfile).where(
            LeagueProfile.profile_id == profile_id, LeagueProfile.user_id == user_id
        )
    )
    if profile is None:
        raise HTTPException(status_code=404, detail="League profile not found")
    return profile


def _deactivate_others(db: Session, user_id: UUID, keep: UUID | None) -> None:
    """Clear is_active on every other profile, in the caller's transaction.

    Must be flushed before the survivor is set active, or the partial unique index
    (`uq_profile_one_active`) sees two active rows mid-statement and rejects.
    """
    for other in db.scalars(
        select(LeagueProfile).where(
            LeagueProfile.user_id == user_id, LeagueProfile.is_active.is_(True)
        )
    ):
        if other.profile_id != keep:
            other.is_active = False
    db.flush()


@router.get("/league-profiles", response_model=list[LeagueProfileOut])
def list_league_profiles(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[LeagueProfile]:
    """List the user's league profiles, active first, then most recently updated."""
    return list(
        db.scalars(
            select(LeagueProfile)
            .where(LeagueProfile.user_id == user.user_id)
            .order_by(LeagueProfile.is_active.desc(), LeagueProfile.updated_at.desc())
        )
    )


@router.post(
    "/league-profiles",
    response_model=LeagueProfileOut,
    status_code=status.HTTP_201_CREATED,
)
def create_league_profile(
    payload: LeagueProfileCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LeagueProfile:
    """Create a league profile. Both spec strings are validated by the schema."""
    if _count(db, LeagueProfile, user.user_id) >= MAX_PROFILES:
        raise HTTPException(
            status_code=409, detail=f"At most {MAX_PROFILES} league profiles."
        )

    # A user's first profile is always active — otherwise they would have profiles
    # and no active one, and the header would have nothing to show.
    has_any = _count(db, LeagueProfile, user.user_id) > 0
    activate = payload.activate or not has_any

    profile = LeagueProfile(
        user_id=user.user_id,
        name=payload.name,
        scoring_spec=payload.scoring_spec,
        league_spec=payload.league_spec,
        is_active=activate,
    )
    if activate:
        _deactivate_others(db, user.user_id, keep=None)

    db.add(profile)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="You already have a profile with that name."
        ) from exc
    db.refresh(profile)
    return profile


@router.patch("/league-profiles/{profile_id}", response_model=LeagueProfileOut)
def update_league_profile(
    profile_id: UUID,
    payload: LeagueProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LeagueProfile:
    """Rename a profile, edit either spec, and/or make it the active one."""
    profile = _get_profile(db, user.user_id, profile_id)
    fields = payload.model_dump(exclude_unset=True)

    if fields.get("activate"):
        _deactivate_others(db, user.user_id, keep=profile.profile_id)
        profile.is_active = True
    elif fields.get("activate") is False:
        # Deactivating the last active profile would leave the user with none, so
        # this is a no-op rather than an error: activation is a radio, not a toggle.
        pass

    for field in ("name", "scoring_spec", "league_spec"):
        if field in fields:
            setattr(profile, field, fields[field])

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="You already have a profile with that name."
        ) from exc
    db.refresh(profile)
    return profile


@router.delete("/league-profiles/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_league_profile(
    profile_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Delete a profile, promoting another if the active one was removed."""
    profile = _get_profile(db, user.user_id, profile_id)
    was_active = profile.is_active
    db.delete(profile)
    db.flush()

    if was_active:
        # Never leave a user holding profiles with none active.
        successor = db.scalars(
            select(LeagueProfile)
            .where(LeagueProfile.user_id == user.user_id)
            .order_by(LeagueProfile.updated_at.desc())
            .limit(1)
        ).first()
        if successor is not None:
            successor.is_active = True

    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Favorites ---------------------------------------------------------------


@router.get("/favorites", response_model=list[FavoriteOut])
def list_favorites(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[FavoriteOut]:
    """The user's watchlist, hydrated with enough player detail to render a row."""
    rows = db.execute(
        select(Favorite, Player, Team.abbreviation)
        .join(Player, Favorite.player_id == Player.player_id)
        .outerjoin(Team, Player.team_id == Team.team_id)
        .where(Favorite.user_id == user.user_id)
        .order_by(Player.name)
    ).all()

    results = []
    for favorite, player, team_abbreviation in rows:
        player_out = PlayerOut.model_validate(player)
        player_out.team_abbreviation = team_abbreviation
        results.append(FavoriteOut(player=player_out, created_at=favorite.created_at))
    return results


@router.put("/favorites/{player_id}", status_code=status.HTTP_204_NO_CONTENT)
def add_favorite(
    player_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Add a player to the watchlist. Idempotent — starring twice is not an error."""
    if db.get(Player, player_id) is None:
        raise HTTPException(status_code=404, detail="Player not found")

    existing = db.get(Favorite, {"user_id": user.user_id, "player_id": player_id})
    if existing is None:
        if _count(db, Favorite, user.user_id) >= MAX_FAVORITES:
            raise HTTPException(
                status_code=409, detail=f"At most {MAX_FAVORITES} favorites."
            )
        db.add(Favorite(user_id=user.user_id, player_id=player_id))
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/favorites/{player_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_favorite(
    player_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Remove a player from the watchlist. Idempotent."""
    db.execute(
        delete(Favorite).where(
            Favorite.user_id == user.user_id, Favorite.player_id == player_id
        )
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Saved views -------------------------------------------------------------


def _get_view(db: Session, user_id: UUID, view_id: UUID) -> SavedView:
    """Fetch one of the user's saved views, or 404."""
    view = db.scalar(
        select(SavedView).where(
            SavedView.view_id == view_id, SavedView.user_id == user_id
        )
    )
    if view is None:
        raise HTTPException(status_code=404, detail="Saved view not found")
    return view


@router.get("/saved-views", response_model=list[SavedViewOut])
def list_saved_views(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[SavedView]:
    """List the user's saved views, most recently updated first."""
    return list(
        db.scalars(
            select(SavedView)
            .where(SavedView.user_id == user.user_id)
            .order_by(SavedView.updated_at.desc())
        )
    )


@router.post(
    "/saved-views", response_model=SavedViewOut, status_code=status.HTTP_201_CREATED
)
def create_saved_view(
    payload: SavedViewCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SavedView:
    """Save the current route + query string under a name."""
    if _count(db, SavedView, user.user_id) >= MAX_SAVED_VIEWS:
        raise HTTPException(
            status_code=409, detail=f"At most {MAX_SAVED_VIEWS} saved views."
        )

    view = SavedView(
        user_id=user.user_id,
        name=payload.name,
        path=payload.path,
        query=payload.query,
    )
    db.add(view)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="You already have a saved view with that name."
        ) from exc
    db.refresh(view)
    return view


@router.patch("/saved-views/{view_id}", response_model=SavedViewOut)
def update_saved_view(
    view_id: UUID,
    payload: SavedViewUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SavedView:
    """Rename a saved view, or re-point it at the current filters."""
    view = _get_view(db, user.user_id, view_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(view, field, value)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="You already have a saved view with that name."
        ) from exc
    db.refresh(view)
    return view


@router.delete("/saved-views/{view_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved_view(
    view_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Delete a saved view."""
    db.delete(_get_view(db, user.user_id, view_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
