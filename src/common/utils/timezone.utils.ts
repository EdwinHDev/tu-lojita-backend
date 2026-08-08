export function getLocalDate(date: Date = new Date(), timezone: string = 'America/Caracas'): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const parts = formatter.formatToParts(date);
  const map = new Map(parts.map(p => [p.type, p.value]));
  return {
    year: parseInt(map.get('year')!),
    month: parseInt(map.get('month')!) - 1, // 0-indexed en JS
    day: parseInt(map.get('day')!),
  };
}

export function getStartOfTodayInTimezone(date: Date = new Date(), timezone: string = 'America/Caracas'): Date {
  const loc = getLocalDate(date, timezone);
  const monthStr = String(loc.month + 1).padStart(2, '0');
  const dayStr = String(loc.day).padStart(2, '0');
  
  // Obtener el offset de la zona horaria para esa fecha en formato ISO
  const formatter = new Intl.DateTimeFormat('fr-CA', {
    timeZone: timezone,
    timeZoneName: 'longOffset',
  });
  const parts = formatter.formatToParts(date);
  const tzName = parts.find(p => p.type === 'timeZoneName')?.value || 'UTC';
  // El offset viene como "GMT-4" o "UTC-04:00"
  const offset = tzName.replace('GMT', '').replace('UTC', '').replace(/[\u2212]/g, '-').trim() || '+00:00';
  
  return new Date(`${loc.year}-${monthStr}-${dayStr}T00:00:00${offset}`);
}

export function getStartOfMonthInTimezone(date: Date = new Date(), timezone: string = 'America/Caracas'): Date {
  const loc = getLocalDate(date, timezone);
  const monthStr = String(loc.month + 1).padStart(2, '0');
  
  const formatter = new Intl.DateTimeFormat('fr-CA', {
    timeZone: timezone,
    timeZoneName: 'longOffset',
  });
  const parts = formatter.formatToParts(date);
  const tzName = parts.find(p => p.type === 'timeZoneName')?.value || 'UTC';
  const offset = tzName.replace('GMT', '').replace('UTC', '').replace(/[\u2212]/g, '-').trim() || '+00:00';
  
  return new Date(`${loc.year}-${monthStr}-01T00:00:00${offset}`);
}

export function formatTimeInTimezone(date: Date, timezone: string = 'America/Caracas'): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return formatter.format(date); // E.g. "6:30 PM"
}

export function formatDateInTimezone(date: Date, timezone: string = 'America/Caracas'): string {
  const formatter = new Intl.DateTimeFormat('es-VE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date); // E.g. "30/05/2026"
}

