import { useEffect, useState } from 'react';

/**
 * Kick-off reminders.
 *
 * In the Android app a real notification is scheduled with the phone's own
 * alarm service (/__remind), so it arrives with Sahrae closed. Android may
 * deliver it a few minutes late to save battery, and a restart of the phone
 * clears it, which is why it is set 15 minutes ahead. On the web there is no
 * reliable way to notify a closed page, so the reminder is a calendar entry
 * (.ics) with its own alert, which every phone and computer can import.
 */

export const LEAD_MS = 15 * 60 * 1000;
const KEY = 'sahrae.reminders.v1';
const EVENT = 'sahrae:reminders';

type Saved = Record<string, { at: number; title: string }>;
const read = (): Saved => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
const write = (s: Saved) => {
  const now = Date.now();
  for (const [k, v] of Object.entries(s)) if (v.at < now - 6 * 3600000) delete s[k];
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* full */ }
  try { window.dispatchEvent(new Event(EVENT)); } catch { /* no window */ }
};

const canNotify = () => (window as unknown as { __sahraeCaps?: { reminders?: boolean } }).__sahraeCaps?.reminders === true;

/** A stable small integer for a fixture id, for Android's notification ids. */
function numericId(id: string): number {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 2_000_000_000;
}

function icsDate(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

/** A calendar entry for the match, with an alert LEAD_MS before. */
export function buildIcs(id: string, title: string, kickoff: number, where?: string, durationMin = 120): string {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sahrae//Matchday//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${id.replace(/[^a-zA-Z0-9.:-]/g, '')}@sahrae`,
    `DTSTAMP:${icsDate(Date.now())}`,
    `DTSTART:${icsDate(kickoff)}`,
    `DTEND:${icsDate(kickoff + durationMin * 60000)}`,
    `SUMMARY:${icsText(title)}`,
    ...(where ? [`LOCATION:${icsText(where)}`] : []),
    'DESCRIPTION:Watch live in Sahrae',
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(title)} starts in 15 minutes`, `TRIGGER:-PT${Math.round(LEAD_MS / 60000)}M`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}

export type ReminderResult = 'notification' | 'calendar' | 'too-late';

export async function setReminder(id: string, title: string, kickoff: number, where?: string): Promise<ReminderResult> {
  const at = kickoff - LEAD_MS;
  if (at <= Date.now()) return 'too-late';
  const s = read();
  s[id] = { at: kickoff, title };
  write(s);
  if (canNotify()) {
    const q = new URLSearchParams({ id: String(numericId(id)), at: String(at), title: `${title} starts in 15 minutes`, text: 'Tap to open Sahrae and watch live' });
    try { await fetch(`https://localhost/__remind?${q}`, { cache: 'no-store' }); } catch { /* the app is still told below */ }
    return 'notification';
  }
  const blob = new Blob([buildIcs(id, title, kickoff, where)], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${title.replace(/[^\w -]+/g, '').slice(0, 60) || 'match'}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return 'calendar';
}

export async function clearReminder(id: string): Promise<void> {
  const s = read();
  delete s[id];
  write(s);
  if (canNotify()) {
    try { await fetch(`https://localhost/__unremind?id=${numericId(id)}`, { cache: 'no-store' }); } catch { /* best effort */ }
  }
}

/** The fixtures with a reminder set, kept current. */
export function useReminders(): Set<string> {
  const [ids, setIds] = useState(() => new Set(Object.keys(read())));
  useEffect(() => {
    const on = () => setIds(new Set(Object.keys(read())));
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return ids;
}
