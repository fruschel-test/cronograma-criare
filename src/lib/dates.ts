/** Cálculos de prazo do cronograma. Feriados ainda precisam ser definidos pela Criare. */

export function addCalendarDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

export function addBusinessDays(dateString: string, businessDays: number, holidays: string[] = []): string {
  const date = new Date(`${dateString}T12:00:00`);
  const holidaySet = new Set(holidays);
  let added = 0;
  while (added < businessDays) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    const iso = toIsoDate(date);
    if (day !== 0 && day !== 6 && !holidaySet.has(iso)) added += 1;
  }
  return toIsoDate(date);
}

export function daysRemaining(dateString: string, today = new Date()): number {
  const due = new Date(`${dateString}T00:00:00`);
  const current = new Date(today);
  current.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - current.getTime()) / 86400000);
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
