// Single source of truth for team leaderboard/reward periods.
//
// A period is the fixed window between two payout moments, never a rolling
// lookback: the weekly board covers Sunday 09:00 Amsterdam through the next
// Sunday 09:00 Amsterdam, and at that moment the top three are paid and the
// board starts empty again. Monthly and yearly work identically, anchored to
// the 1st of the month and the 1st of January.
//
// The anchor is Amsterdam *wall clock*, so the corresponding UTC instant moves
// by an hour between CEST and CET. All arithmetic below is done on the civil
// (calendar) date and only converted to an instant at the end, which is what
// keeps a period exactly one week/month/year long across a DST change.

export const PAYOUT_TIME_ZONE = "Europe/Amsterdam";
export const PAYOUT_HOUR = 9;

export type TeamPeriod = "WEEKLY" | "MONTHLY" | "YEARLY";
export type TeamPeriodName = "weekly" | "monthly" | "yearly";

export const toTeamPeriod = (name: TeamPeriodName): TeamPeriod =>
  name.toUpperCase() as TeamPeriod;

type CivilDate = { year: number; month: number; day: number };

const zonedFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: PAYOUT_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
});

const weekdayIndexes: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** The Amsterdam wall-clock reading of a UTC instant. */
const getZonedParts = (instant: Date) => {
  const parts = zonedFormatter.formatToParts(instant);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";

  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    // hourCycle h23 keeps midnight at 00, but normalize defensively.
    hour: Number(value("hour")) % 24,
    minute: Number(value("minute")),
    second: Number(value("second")),
    weekday: weekdayIndexes[value("weekday")] ?? 0,
  };
};

const getZoneOffsetMs = (instant: Date) => {
  const parts = getZonedParts(instant);
  const asIfUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
};

/**
 * The UTC instant of an Amsterdam wall-clock time. The offset depends on the
 * instant we are trying to find, so the first guess is corrected once - enough
 * to land on the right side of a DST transition.
 */
const zonedToUtc = ({ year, month, day }: CivilDate, hour: number) => {
  const naive = Date.UTC(year, month - 1, day, hour, 0, 0, 0);
  const firstGuess = naive - getZoneOffsetMs(new Date(naive));
  const corrected = naive - getZoneOffsetMs(new Date(firstGuess));
  return new Date(corrected);
};

const shiftDays = ({ year, month, day }: CivilDate, days: number): CivilDate => {
  const moved = new Date(Date.UTC(year, month - 1, day));
  moved.setUTCDate(moved.getUTCDate() + days);
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() };
};

const shiftPeriods = (start: CivilDate, period: TeamPeriod, count: number): CivilDate => {
  if (period === "WEEKLY") {
    return shiftDays(start, count * 7);
  }
  if (period === "MONTHLY") {
    const moved = new Date(Date.UTC(start.year, start.month - 1 + count, 1));
    return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: 1 };
  }
  return { year: start.year + count, month: 1, day: 1 };
};

/** The civil date of the period boundary that `instant` currently sits in. */
const getPeriodStartCivil = (period: TeamPeriod, instant: Date): CivilDate => {
  const parts = getZonedParts(instant);
  const today: CivilDate = { year: parts.year, month: parts.month, day: parts.day };

  let candidate: CivilDate;
  if (period === "WEEKLY") {
    candidate = shiftDays(today, -parts.weekday);
  } else if (period === "MONTHLY") {
    candidate = { year: parts.year, month: parts.month, day: 1 };
  } else {
    candidate = { year: parts.year, month: 1, day: 1 };
  }

  // Before the payout hour on the boundary day, the current period is still
  // the previous one - the reset has not happened yet.
  if (instant.getTime() < zonedToUtc(candidate, PAYOUT_HOUR).getTime()) {
    candidate = shiftPeriods(candidate, period, -1);
  }
  return candidate;
};

export const getPeriodKey = (period: TeamPeriod, start: CivilDate) => {
  const month = String(start.month).padStart(2, "0");
  if (period === "YEARLY") return `${start.year}`;
  if (period === "MONTHLY") return `${start.year}-${month}`;
  return `${start.year}-${month}-${String(start.day).padStart(2, "0")}`;
};

export type TeamPeriodWindow = {
  period: TeamPeriod;
  /** Inclusive start of the window. */
  start: Date;
  /** Exclusive end - also the moment this period is paid out and reset. */
  end: Date;
  periodKey: string;
};

/**
 * `offset` selects which period relative to the one in progress:
 * 0 is the live board, -1 is the period that just closed (what a payout pays).
 */
export const getPeriodWindow = (
  period: TeamPeriod,
  now: Date = new Date(),
  offset = 0,
): TeamPeriodWindow => {
  const currentStart = getPeriodStartCivil(period, now);
  const start = shiftPeriods(currentStart, period, offset);
  const end = shiftPeriods(start, period, 1);

  return {
    period,
    start: zonedToUtc(start, PAYOUT_HOUR),
    end: zonedToUtc(end, PAYOUT_HOUR),
    periodKey: getPeriodKey(period, start),
  };
};
