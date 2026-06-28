/* CardHearth home — the games menu. Recreates the site landing page with the
   "B / warm gold" treatment, plus return hooks: a recently-played rail, an
   achievements shelf, and a monthly Daily-Challenge calendar. Cards deal in
   with a staggered entrance (reduced-motion safe — see index.html). */
const CARD_GAMES = [
  { id: 'klondike', name: 'Klondike', tagline: 'The classic solitaire' },
  { id: 'spider', name: 'Spider', tagline: 'Build suit runs across ten columns' },
  { id: 'freecell', name: 'FreeCell', tagline: 'Every deal is open — and almost all are winnable', highlight: 'Almost every deal winnable' },
  { id: 'pyramid', name: 'Pyramid', tagline: 'Pair cards that sum to thirteen' },
  { id: 'hearts', name: 'Hearts', tagline: 'Trick-taking vs three computer players', highlight: 'Play against the computer' },
  { id: 'gin', name: 'Gin Rummy', tagline: 'Draw, meld sets and runs, and knock', highlight: 'Play against the computer' },
];
const PUZZLES = [
  { id: 'sudoku', name: 'Sudoku', tagline: 'Pure logic, four difficulties', highlight: 'Every puzzle logic-solvable — no guessing' },
  { id: 'mahjong', name: 'Mahjong', tagline: 'Match free tiles, dismantle the turtle', highlight: 'Every board guaranteed solvable' },
  { id: '2048', name: '2048', tagline: 'Slide, merge, and chase the famous tile' },
];
const RECENT = [
  { id: 'klondike', name: 'Klondike', sub: 'Resume · deal #1042', cta: 'Resume' },
  { id: 'freecell', name: 'FreeCell', sub: 'Last won · 2:31', cta: 'Play' },
  { id: 'sudoku', name: 'Sudoku', sub: 'Resume · Hard', cta: 'Resume' },
];
const BADGES = [
  { icon: '🃏', name: 'First win', earned: true },
  { icon: '🔥', name: '5-day streak', earned: true },
  { icon: '🎯', name: 'No hints', earned: true },
  { icon: '🧩', name: 'Puzzle master', earned: false },
  { icon: '🏔️', name: 'Spider IV', earned: false },
];

function AccountIcon() {
  return <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>;
}

function DailyCalendar() {
  const { StreakCalendar } = window.CardHearthDesignSystem_7eedad;
  const now = new Date();
  const today = now.getDate();
  const monthName = now.toLocaleString('en-US', { month: 'long' });
  // A plausible solved pattern: every day so far except every 4th.
  const solved = Array.from({ length: today }, (_, i) => i + 1).filter((d) => d % 4 !== 0);
  return (
    <section className="deal-in" style={{ maxWidth: '30rem', margin: '2.5rem auto 0', width: '100%' }} aria-label="Your Daily Challenge calendar">
      <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 800, textAlign: 'center', marginBottom: '0.2rem' }}>Fill your calendar</h2>
      <p style={{ textAlign: 'center', fontSize: 'var(--text-sm)', opacity: 0.82, margin: '0 0 1rem' }}>
        Solve the Daily and light up the day. <strong style={{ color: 'var(--gold)' }}>{solved.length} of {today}</strong> solved this {monthName}.
      </p>
      <StreakCalendar solved={solved} />
    </section>
  );
}

function Home({ onOpen }) {
  const { Button, Pill, Badge, Panel, GameCard, BadgeShelf } = window.CardHearthDesignSystem_7eedad;
  const GameArt = window.GameArt;
  const total = CARD_GAMES.length + PUZZLES.length;

  const Section = ({ title, games, base = 0 }) => (
    <>
      <h2 style={{ margin: '1.6rem 0 0.7rem', fontSize: '1.05rem', fontWeight: 800, color: 'var(--gold)' }}>{title}</h2>
      <div style={{ display: 'grid', gap: '0.9rem', gridTemplateColumns: 'repeat(auto-fit, minmax(13rem, 1fr))' }}>
        {games.map((g, i) => (
          <div key={g.id} className="deal-in" style={{ display: 'flex', animationDelay: (base + i) * 0.05 + 's' }}>
            <GameCard name={g.name} tagline={g.tagline} highlight={g.highlight} style={{ flex: 1 }}
              href="#" onClick={(e) => { e.preventDefault(); onOpen(g.id); }}>
              <GameArt game={g.id} />
            </GameCard>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <main style={{ margin: '0 auto', width: '100%', maxWidth: 'var(--container-page)', padding: '0 1rem 3rem', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.75rem' }}>
        <Button icon={<AccountIcon />}>Account &amp; badges</Button>
      </div>

      <header className="deal-in" style={{ padding: '1.5rem 0 2.5rem', textAlign: 'center' }}>
        <img src="../../assets/logo-lockup-reversed.svg" alt="CardHearth" style={{ height: '46px', marginBottom: '1.1rem' }} />
        <h1 style={{ fontSize: 'var(--text-5xl)', fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.05, margin: 0 }}>
          Free Solitaire &amp; Puzzle Games
        </h1>
        <div style={{ width: '64px', height: '4px', borderRadius: '3px', background: 'var(--gold)', margin: '0.85rem auto 0' }} aria-hidden="true"></div>
        <p style={{ margin: '0.75rem auto 0', maxWidth: '32rem', fontSize: 'var(--text-base)', opacity: 0.85 }}>
          Your cozy home for {total} classic card &amp; puzzle games. Pick one and play in seconds — nothing to install, no account needed.
        </p>
        <ul style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.4rem 0.5rem', listStyle: 'none', padding: 0, margin: '1.1rem auto 0', maxWidth: '40rem' }}>
          {['🎴 '+total+' free games', '📅 Daily Challenge', '🚫 No sign-up', '🏆 Stats & achievements', '📲 Installable app'].map((t) => (
            <li key={t}><Pill size="sm" active={t === '📅 Daily Challenge'}>{t}</Pill></li>
          ))}
        </ul>
      </header>

      {/* Recently played — returning-visitor rail */}
      <section className="deal-in" aria-label="Continue playing" style={{ marginBottom: '1.6rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
          <h2 style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6, margin: 0 }}>Continue playing</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(13rem, 1fr))', gap: '0.6rem' }}>
          {RECENT.map((r) => (
            <a key={r.id} href="#" onClick={(e) => { e.preventDefault(); onOpen(r.id); }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.55rem 0.7rem', borderRadius: 'var(--radius-lg)', textDecoration: 'none', color: 'var(--chrome-text)', background: 'var(--on-felt-fill)', border: '1px solid var(--on-felt-line)' }}>
              <span aria-hidden="true" style={{ flex: 'none', width: '3rem', height: '2.4rem', borderRadius: '8px', overflow: 'hidden', background: 'var(--surface-thumb-bg)', display: 'grid', placeItems: 'center' }}>
                <span style={{ width: '88%' }}><GameArt game={r.id} /></span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.25 }}>
                <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>{r.name}</span>
                <span style={{ fontSize: 'var(--text-2xs)', opacity: 0.7 }}>{r.sub}</span>
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--gold)' }}>{r.cta} →</span>
            </a>
          ))}
        </div>
      </section>

      <nav aria-label="Choose a game">
        <a href="#" className="deal-in" onClick={(e) => { e.preventDefault(); onOpen('klondike'); }}
          style={{ display: 'flex', gap: 0, marginBottom: '1.6rem', borderRadius: 'var(--radius-xl)', overflow: 'hidden', textDecoration: 'none', color: 'var(--chrome-text)', background: 'linear-gradient(120deg, rgb(255 217 94 / 0.24), rgb(0 0 0 / 0.26))', border: '1px solid var(--gold)', boxShadow: 'var(--shadow-card)' }}>
          <span style={{ flex: '0 0 30%', maxWidth: '15rem', background: 'var(--surface-thumb-bg)', display: 'grid', placeItems: 'center', padding: '6px 0' }} aria-hidden="true"><GameArt game="daily" /></span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '1.1rem 1.3rem' }}>
            <Badge tone="gold">⭐ Daily Challenge · 🔥 5-day streak</Badge>
            <span style={{ fontSize: 'var(--text-xl)', fontWeight: 800 }}>Today: Klondike</span>
            <span style={{ fontSize: 'var(--text-sm)', opacity: 0.8 }}>One puzzle, the same for everyone — keep your streak alive.</span>
            <span style={{ display: 'flex', gap: '5px', marginTop: '0.55rem' }} aria-hidden="true">
              {['M','T','W','T','F','S','S'].map((d, i) => (
                <span key={i} style={{ width: '18px', height: '18px', borderRadius: '6px', display: 'grid', placeItems: 'center', fontSize: '9px', fontWeight: 700, background: i < 5 ? 'var(--gold)' : 'rgb(255 255 255 / 0.08)', color: i < 5 ? 'var(--gold-ink)' : 'var(--chrome-text)', outline: i === 5 ? '2px solid var(--gold)' : 'none', outlineOffset: '-2px', opacity: i > 5 ? 0.4 : 1 }}>{i < 5 ? '✓' : d}</span>
              ))}
            </span>
            <span style={{ marginTop: '0.5rem', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--gold)' }}>Play today's challenge →</span>
          </span>
        </a>

        <Section title="Card Games" games={CARD_GAMES} base={0} />
        <Section title="Puzzles" games={PUZZLES} base={CARD_GAMES.length} />
      </nav>

      {/* Achievements teaser shelf */}
      <div className="deal-in" style={{ margin: '1.8rem auto 0', width: '100%', maxWidth: '40rem' }}>
        <BadgeShelf summary="3 of 24 unlocked" href="#" badges={BADGES} onClick={(e) => e.preventDefault()} />
      </div>

      <DailyCalendar />

      <section className="deal-in" style={{ maxWidth: '56rem', margin: '2.5rem auto 0', width: '100%' }} aria-label="Why play on CardHearth">
        <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 800, textAlign: 'center', marginBottom: '1.1rem' }}>Why play on CardHearth?</h2>
        <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))', gap: '0.8rem', listStyle: 'none', padding: 0, margin: 0 }}>
          {[['✅', 'Fair puzzles', 'Every Sudoku is logic-solvable and every Mahjong board is clearable.'],
            ['↩️', 'Unlimited undo & hints', 'Explore a line, take it back, and get a nudge whenever you\'re stuck.'],
            ['📅', 'Daily Challenge', 'A new game each day, the same for everyone, with a streak to defend.'],
            ['🔒', 'Free & private', 'No sign-up, no download; your progress stays on your device.']].map(([icon, h, b]) => (
            <li key={h}><Panel pad="sm" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: 'var(--text-sm)', opacity: 0.95, height: '100%' }}>
              <span aria-hidden="true" style={{ fontSize: '1.4rem', lineHeight: 1 }}>{icon}</span>
              <strong style={{ color: '#fff' }}>{h}</strong>{b}
            </Panel></li>
          ))}
        </ul>
        <p style={{ textAlign: 'center', marginTop: '1.3rem' }}>
          <Button variant="primary" size="lg" onClick={() => onOpen('sudoku')}>▶ Start with today's Daily Challenge</Button>
        </p>
      </section>

      <footer style={{ marginTop: '2.5rem', paddingTop: '1.3rem', borderTop: '1px solid var(--on-felt-line-soft)', textAlign: 'center', fontSize: 'var(--text-xs)', opacity: 0.7 }}>
        <p style={{ margin: '0 0 0.4rem', fontWeight: 700, color: 'var(--chrome-text)', opacity: 0.92 }}>A new game every day · {total} free games · always free to play</p>
        CardHearth runs right in your browser — no install, no account required, always free to play.
      </footer>
    </main>
  );
}
window.Home = Home;
