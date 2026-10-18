import { describe, expect, it } from 'vitest';
import { feedEventsToMeetings, isFeedUrl } from '../src/lib/outlookFeed';

describe('work calendar feed', () => {
  it('accepts only https .ics links from calendar hosts', () => {
    expect(isFeedUrl('https://outlook.office365.com/owa/calendar/x@y.com/abc/calendar.ics')).toBe(true);
    expect(isFeedUrl('http://outlook.office365.com/owa/calendar/x/calendar.ics')).toBe(false);
    expect(isFeedUrl('https://evil.example.com/calendar.ics')).toBe(false);
    expect(isFeedUrl('https://outlook.office365.com/owa/calendar/x/calendar.html')).toBe(false);
  });
  it('turns events into read-only meetings and all-day events into Cairo days', () => {
    const [timed, allDay] = feedEventsToMeetings([
      { uid: 'a', title: 'Board', allDay: false, start: '2026-10-20T07:00:00.000Z', end: '2026-10-20T08:00:00.000Z' },
      { uid: 'b', title: 'Holiday', allDay: true, start: '2026-10-21', end: '2026-10-22' },
    ]);
    expect(timed.id).toBe('ics_a');
    expect(timed.start).toBe('2026-10-20T07:00:00.000Z');
    expect(allDay.start).toBe('2026-10-20T21:00:00.000Z'); // 21 Oct 00:00 in Cairo (UTC+3)
    expect(allDay.end).toBe('2026-10-21T21:00:00.000Z');
  });
});
