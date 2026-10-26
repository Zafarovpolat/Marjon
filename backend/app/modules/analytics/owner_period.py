"""Minute-inclusive OWNER report bounds in the selected local timezone."""
from datetime import datetime, time, timedelta, timezone

from app.shared.exceptions import ValidationError


def owner_period_bounds(date_from, date_to, tz, time_from=None, time_to=None):
    try:
        first = time.fromisoformat(time_from) if time_from else time.min
        last = time.fromisoformat(time_to) if time_to else None
    except ValueError:
        raise ValidationError("Invalid report time")
    start = datetime.combine(date_from, first, tzinfo=tz)
    # An end minute of 23:59 includes 23:59:59, but never next day's 00:00.
    end = (datetime.combine(date_to, last, tzinfo=tz) + timedelta(minutes=1)
           if last is not None else datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=tz))
    if start >= end:
        raise ValidationError("Report start must not be after report end")
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)
