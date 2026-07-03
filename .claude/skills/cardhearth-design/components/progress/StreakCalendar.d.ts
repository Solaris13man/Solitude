import * as React from 'react';

/**
 * A month grid that lights solved days gold, outlines today, and dims the future — the Daily streak hook.
 * @startingPoint section="Progress" subtitle="Daily-streak month calendar" viewport="700x360"
 */
export interface StreakCalendarProps {
  /** Full year, e.g. 2026. Defaults to the current year. */
  year?: number;
  /** Month index, 0–11. Defaults to the current month. */
  month?: number;
  /** Day numbers that are solved/complete. Array or Set. */
  solved?: number[] | Set<number>;
  /** Day number to outline as "today". Defaults to today when viewing the current month. */
  today?: number;
  /** Override the "Month Year" header label. */
  monthLabel?: string;
  style?: React.CSSProperties;
}

/** A month grid that lights solved days gold, outlines today, and dims the future. */
export function StreakCalendar(props: StreakCalendarProps): JSX.Element;
