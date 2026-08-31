export type ContractorTimeEntryInput = {
  workDate: string;
  hours: number;
  workLabel: string;
  notes: string | null;
};

const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

function validDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function dateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function payrollWeekWindow(value: unknown) {
  if (typeof value !== "string" || !validDate(value)) {
    throw new Error("Week must contain a valid date.");
  }

  const selected = new Date(`${value}T12:00:00.000Z`);
  const dayFromMonday = (selected.getUTCDay() + 6) % 7;
  const start = new Date(selected);
  start.setUTCDate(start.getUTCDate() - dayFromMonday);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  return { start: dateString(start), end: dateString(end) };
}

export function payrollMonthWindow(value: unknown) {
  if (typeof value !== "string" || !MONTH_PATTERN.test(value)) {
    throw new Error("Month must use YYYY-MM format.");
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  if (year < 2020 || year > 2100) {
    throw new Error("Month is outside the supported range.");
  }

  const start = `${value}-01`;
  const next =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  return { month: value, start, next };
}

export function validateContractorTimeEntryInput(
  input: Record<string, unknown>,
): ContractorTimeEntryInput {
  const workDate = String(input.workDate ?? "");
  const workLabel = String(input.workLabel ?? "").trim();
  const notes = String(input.notes ?? "").trim();
  const hours =
    typeof input.hours === "number"
      ? input.hours
      : typeof input.hours === "string" && input.hours.trim()
        ? Number(input.hours)
        : Number.NaN;

  if (!validDate(workDate)) {
    throw new Error("Choose a valid work date.");
  }
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    throw new Error("Hours must be greater than zero and no more than 24.");
  }
  if (!workLabel || workLabel.length > 120) {
    throw new Error("Work or project must be between 1 and 120 characters.");
  }
  if (notes.length > 500) {
    throw new Error("Notes must be 500 characters or fewer.");
  }

  return {
    workDate,
    hours: Math.round(hours * 100) / 100,
    workLabel,
    notes: notes || null,
  };
}

export function contractorWeekTotals(input: {
  loggedHours: number;
  hourlyRate: number;
  weeklyCap: number;
}) {
  const loggedHours = Math.round(input.loggedHours * 100) / 100;
  const estimatedPay =
    Math.round(loggedHours * input.hourlyRate * 100) / 100;
  const remainingHours =
    Math.round((input.weeklyCap - loggedHours) * 100) / 100;

  return {
    loggedHours,
    estimatedPay,
    remainingHours,
    isOverCap: input.weeklyCap > 0 && remainingHours < 0,
  };
}

export function contractorWeeklyAllowance(input: {
  loggedHours: number;
  weeklyCap: number;
  requestedHours: number;
}) {
  const remainingHours = Math.max(
    0,
    Math.round((input.weeklyCap - input.loggedHours) * 100) / 100,
  );
  return {
    remainingHours,
    canLog: input.requestedHours <= remainingHours,
  };
}
