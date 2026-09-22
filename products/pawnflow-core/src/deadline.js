function assertValidDate(value, field) {
  const d = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(d.valueOf())) throw new TypeError(field + " must be a valid date");
  return d;
}

function lastDayOfMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function addCalendarMonths(dateValue, months) {
  const d = assertValidDate(dateValue, "date");
  const wholeMonths = Number(months);

  if (!Number.isInteger(wholeMonths) || wholeMonths < 0) {
    throw new TypeError("months must be a non-negative integer");
  }

  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  const targetMonthIndex = month + wholeMonths;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const targetDay = Math.min(day, lastDayOfMonth(targetYear, targetMonth));

  return new Date(Date.UTC(targetYear, targetMonth, targetDay));
}

export function calculateDeadlineExtension({
  previousDeadline,
  paidMonths,
  ruleVersion = "0.1.0"
}) {
  const oldDeadline = assertValidDate(previousDeadline, "previousDeadline");
  const newDeadline = addCalendarMonths(oldDeadline, paidMonths);

  return Object.freeze({
    ruleVersion,
    previousDeadline: oldDeadline.toISOString().slice(0, 10),
    paidMonths,
    newDeadline: newDeadline.toISOString().slice(0, 10)
  });
}

export function inferPaidMonths({ paymentAmount, monthlyInterest }) {
  const amount = Number(paymentAmount);
  const interest = Number(monthlyInterest);

  if (!Number.isFinite(amount) || !Number.isFinite(interest) || interest <= 0 || amount < 0) {
    throw new TypeError("paymentAmount and monthlyInterest must be valid amounts");
  }

  const wholeMonths = Math.floor(amount / interest);
  const remainder = amount - wholeMonths * interest;

  return Object.freeze({
    wholeMonths,
    remainder,
    exact: remainder === 0
  });
}
