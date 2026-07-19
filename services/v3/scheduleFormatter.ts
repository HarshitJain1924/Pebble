export function formatReminderTime(hour?: number, minute?: number): string | null {
  if (hour === undefined || minute === undefined) return null;
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  const displayMinute = String(minute).padStart(2, "0");
  return `${displayHour}:${displayMinute} ${ampm}`;
}

export function formatScheduleDays(days?: number[]): string | null {
  if (!days || days.length === 0) return null;
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return "Every day";
  if (sorted.length === 5 && !sorted.includes(0) && !sorted.includes(6)) return "Weekdays";
  if (sorted.length === 2 && sorted.includes(0) && sorted.includes(6)) return "Weekends";
  
  const DAY_FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return sorted.map((d) => DAY_FULL[d] ?? d).join(", ");
}
