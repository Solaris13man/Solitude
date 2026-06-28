import React from 'react';
import { Panel } from '../surfaces/Panel.jsx';

/**
 * StreakCalendar — a month grid that lights up solved days in gold, outlines
 * today, and dims the future. Built for the Daily Challenge "fill your
 * calendar" hook, but works for any per-day completion streak. Renders inside
 * a gold-veiled Panel with the month label on top.
 */
export function StreakCalendar({
  year,
  month,
  solved = [],
  today,
  monthLabel,
  style = {},
  ...rest
}) {
  const now = new Date();
  const y = year ?? now.getFullYear();
  const m = month ?? now.getMonth();
  const td = today ?? (y === now.getFullYear() && m === now.getMonth() ? now.getDate() : -1);
  const label = monthLabel ?? new Date(y, m, 1).toLocaleString('en-US', { month: 'long' }) + ' ' + y;
  const solvedSet = solved instanceof Set ? solved : new Set(solved);

  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const firstDow = new Date(y, m, 1).getDay();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const cell = (d, i) => {
    if (d == null) return <span key={'b' + i} aria-hidden="true" />;
    const done = solvedSet.has(d);
    const isToday = d === td;
    const future = td >= 0 && d > td;
    return (
      <span key={d} title={done ? 'Solved' : isToday ? 'Today' : ''}
        style={{
          aspectRatio: '1', display: 'grid', placeItems: 'center',
          fontSize: '0.62rem', fontWeight: 700, borderRadius: '5px',
          background: done ? 'var(--gold)' : isToday ? 'rgb(255 217 94 / 0.12)' : 'rgb(255 255 255 / 0.05)',
          color: done ? 'var(--gold-ink)' : 'var(--chrome-text)',
          outline: isToday ? '2px solid var(--gold)' : 'none', outlineOffset: '-2px',
          opacity: future ? 0.32 : 1,
        }}>{done ? '✓' : d}</span>
    );
  };

  return (
    <Panel tone="gold" pad="md" style={style} {...rest}>
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, textAlign: 'center', marginBottom: '0.5rem', opacity: 0.9 }}>{label}</div>
      <div role="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => (
          <span key={'w' + i} aria-hidden="true" style={{ fontSize: '0.55rem', textAlign: 'center', opacity: 0.45, paddingBottom: '0.15rem' }}>{w}</span>
        ))}
        {cells.map((d, i) => cell(d, i))}
      </div>
    </Panel>
  );
}
