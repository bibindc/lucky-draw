import { describe, expect, it } from 'vitest';
import { spreadDrawDates } from './drawSchedule';

describe('even draw schedule (AC-CAM-9)', () => {
  it('places one draw a month on the same day when months equal draws', () => {
    expect(spreadDrawDates('2026-11-15T18:30', 5, 5)).toEqual([
      '2026-11-15T18:30', '2026-12-15T18:30', '2027-01-15T18:30', '2027-02-15T18:30', '2027-03-15T18:30',
    ]);
  });

  it('places two draws a month, about two weeks apart, for twice as many draws as months', () => {
    expect(spreadDrawDates('2026-11-01T18:30', 2, 4)).toEqual([
      '2026-11-01T18:30', '2026-11-16T18:30', '2026-12-01T18:30', '2026-12-17T18:30',
    ]);
  });

  it('spaces draws every few days when there are many draws in a short campaign', () => {
    const dates = spreadDrawDates('2026-11-01T10:00', 2, 10);
    expect(dates).toHaveLength(10);
    expect(dates.slice(0, 3)).toEqual(['2026-11-01T10:00', '2026-11-07T10:00', '2026-11-13T10:00']);
    expect(dates.at(-1)! < '2027-01-01T10:00').toBe(true);
  });

  it('spreads fewer draws than months across whole months where it can', () => {
    expect(spreadDrawDates('2026-11-10T18:30', 6, 3)).toEqual(['2026-11-10T18:30', '2027-01-10T18:30', '2027-03-10T18:30']);
  });

  it('clamps to the end of shorter months', () => {
    expect(spreadDrawDates('2027-01-31T18:30', 3, 3)).toEqual(['2027-01-31T18:30', '2027-02-28T18:30', '2027-03-31T18:30']);
  });

  it('keeps dates unique and in order when there are more draws than days', () => {
    const dates = spreadDrawDates('2027-02-01T09:00', 1, 40);
    expect(new Set(dates).size).toBe(40);
    expect([...dates].sort()).toEqual(dates);
  });

  it('returns nothing for an incomplete first draw', () => {
    expect(spreadDrawDates('', 5, 10)).toEqual([]);
  });
});
