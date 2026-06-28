/* CardHearth game shell — the in-game view: header toolbar, HUD, a Klondike
   board rendered with the premium "ink" deck, collapsible instructions, plus
   the Settings and Win dialogs. Cosmetic recreation (not a real rules engine). */
const FACES = '../../assets/cards/ink-shadow/';

function PlayCard({ face, back, w = 74, style = {} }) {
  const common = {
    width: w, aspectRatio: '100 / 140', borderRadius: 'max(6px, ' + (w * 0.075) + 'px)',
    boxShadow: 'var(--shadow-playcard)', flex: 'none', overflow: 'hidden', position: 'relative', ...style,
  };
  if (back) {
    return (
      <div style={{ ...common, background: 'linear-gradient(155deg, var(--card-back-a), var(--card-back-b))',
        border: '1px solid rgb(0 0 0 / 0.25)', boxShadow: 'inset 0 0 0 3px rgb(255 255 255 / 0.85), var(--shadow-playcard)' }} />
    );
  }
  return (
    <div style={{ ...common, background: '#fff' }}>
      <img src={FACES + face + '.webp'} alt="" style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }} />
    </div>
  );
}

function Slot({ glyph, w = 74 }) {
  return (
    <div style={{ width: w, aspectRatio: '100 / 140', borderRadius: 'max(6px, ' + (w * 0.075) + 'px)',
      border: '1.5px solid var(--slot-line, rgb(255 255 255 / 0.28))', background: 'rgb(0 0 0 / 0.12)',
      boxShadow: 'var(--shadow-inset-slot)', display: 'grid', placeItems: 'center', flex: 'none' }}>
      <span style={{ fontSize: w * 0.42, color: 'rgb(255 255 255 / 0.28)', lineHeight: 1 }}>{glyph}</span>
    </div>
  );
}

function ToolbarBtn({ id, label, path, primary, hidden, disabled, onClick }) {
  const { Button } = window.CardHearthDesignSystem_7eedad;
  if (hidden) return null;
  const icon = <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{path}</svg>;
  return <Button variant={primary ? 'primary' : 'glass'} icon={icon} disabled={disabled} onClick={onClick}>{label}</Button>;
}

function GameShell({ gameId, onHome }) {
  const { Button, Hud, Dialog, Panel } = window.CardHearthDesignSystem_7eedad;
  const [showSettings, setShowSettings] = React.useState(false);
  const [showWin, setShowWin] = React.useState(false);
  const [wasteCount, setWasteCount] = React.useState(1);

  // A fixed, plausible Klondike tableau using the imported ink faces.
  const tableau = [
    [{ back: 1 }, { back: 1 }, { face: 'S13' }],
    [{ back: 1 }, { face: 'H12' }],
    [{ face: 'C10' }],
    [{ back: 1 }, { back: 1 }, { back: 1 }, { face: 'D7' }],
    [{ back: 1 }, { face: 'S11' }],
    [{ back: 1 }, { back: 1 }, { face: 'H13' }],
    [{ face: 'D11' }],
  ];

  return (
    <main style={{ margin: '0 auto', width: '100%', maxWidth: 'var(--container-page)', padding: '0 0.75rem 2.5rem', display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.75rem 0' }}>
        <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 800, letterSpacing: '-0.01em', margin: 0 }}>
          Klondike <a href="#" onClick={(e) => { e.preventDefault(); onHome(); }} style={{ fontWeight: 400, textDecoration: 'none', opacity: 0.7, color: 'inherit' }}>· CardHearth</a>
        </h1>
        <nav style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }} aria-label="Game controls">
          <ToolbarBtn label="Home" onClick={onHome} path={<><path d="m3 11 9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/></>} />
          <ToolbarBtn label="New" path={<><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v5h-5"/></>} onClick={() => setShowWin(false)} />
          <ToolbarBtn label="Undo" disabled path={<><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></>} />
          <ToolbarBtn label="Hint" path={<><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.9 10.6c.6.5.9 1.3.9 2.1V16h6v-.3c0-.8.3-1.6.9-2.1A6 6 0 0 0 12 3z"/></>} />
          <ToolbarBtn label="Auto-finish" primary onClick={() => setShowWin(true)} path={<><path d="m4 5 7 7-7 7"/><path d="m13 5 7 7-7 7"/></>} />
          <ToolbarBtn label="Stats" path={<><path d="M5 20v-7"/><path d="M12 20V5"/><path d="M19 20v-11"/></>} />
          <ToolbarBtn label="Settings" onClick={() => setShowSettings(true)} path={<><path d="M4 8h8"/><path d="M18 8h2"/><circle cx="15" cy="8" r="2.2"/><path d="M4 16h2"/><path d="M12 16h8"/><circle cx="9" cy="16" r="2.2"/></>} />
        </nav>
      </header>

      <Hud items={[{ label: 'Time', value: '1:42' }, { label: 'Moves', value: 23 }, { label: 'Score', value: 95 }]} deal="#1042" style={{ marginBottom: '1rem' }} />

      {/* Board */}
      <div style={{ position: 'relative' }}>
        {/* top row: stock + waste (left), foundations (right) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '1.4rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={{ cursor: 'pointer' }} onClick={() => setWasteCount((c) => (c % 3) + 1)} title="Draw"><PlayCard back /></div>
            <div style={{ position: 'relative', width: 74 + 24 }}>
              {['H1', 'C1', 'S1'].slice(0, wasteCount).map((f, i) => (
                <div key={f} style={{ position: 'absolute', left: i * 12, top: 0 }}><PlayCard face={f} /></div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Slot glyph="♠" /><Slot glyph="♥" /><Slot glyph="♦" /><Slot glyph="♣" />
          </div>
        </div>

        {/* tableau */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.5rem', justifyItems: 'center' }}>
          {tableau.map((col, ci) => (
            <div key={ci} style={{ position: 'relative', width: 74, minHeight: (col.length - 1) * 26 + 104 }}>
              {col.map((c, i) => (
                <div key={i} style={{ position: 'absolute', top: i * 26, left: 0, zIndex: i }}>
                  <PlayCard face={c.face} back={c.back} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* instructions */}
      <details style={{ margin: '2rem auto 0', maxWidth: '42rem', width: '100%', border: '1px solid var(--on-felt-line)', borderRadius: '14px', background: 'var(--on-felt-fill-soft)' }}>
        <summary style={{ listStyle: 'none', cursor: 'pointer', padding: '0.85rem 1.1rem', fontWeight: 700, fontSize: 'var(--text-sm)' }}>How to play, tips &amp; FAQ</summary>
        <div style={{ padding: '0 1.2rem 1.3rem', fontSize: 'var(--text-sm)', lineHeight: 1.7, opacity: 0.9 }}>
          Build the four foundations up from Ace to King by suit. On the tableau, stack cards in descending order and alternating colors. Tap a card to auto-move it to the best spot; only Kings go to an empty column. Unlimited undo and hints are always one click away.
        </div>
      </details>

      {showSettings && (
        <Dialog title="Settings" onClose={() => setShowSettings(false)} footer={
          <Button variant="primary" style={{ background: 'var(--dialog-green)', borderColor: 'var(--dialog-green)', color: '#fff' }} onClick={() => setShowSettings(false)}>Done</Button>
        }>
          {[['Theme', ['System', 'Light', 'Dark']], ['Table surface', ['Felt', 'Walnut', 'Oak', 'Marble', 'Granite']], ['Felt color', ['Green', 'Blue', 'Slate', 'Crimson']], ['Card design', ['Ink · hand-drawn', 'Modern · Blue', 'Classic']]].map(([label, opts]) => (
            <label key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '0.45rem 0' }}>
              {label}
              <select defaultValue={opts[0]} style={{ border: '1px solid rgb(127 127 127 / 0.4)', borderRadius: '0.45rem', padding: '0.3rem 0.5rem', background: 'var(--panel-light)', color: 'var(--panel-text)' }}>
                {opts.map((o) => <option key={o}>{o}</option>)}
              </select>
            </label>
          ))}
        </Dialog>
      )}

      {showWin && (
        <Dialog title="🎉 You won!" onClose={() => setShowWin(false)} footer={<>
          <Button onClick={() => setShowWin(false)}>Close</Button>
          <Button>Share deal</Button>
          <Button variant="primary" style={{ background: 'var(--dialog-green)', borderColor: 'var(--dialog-green)', color: '#fff' }} onClick={() => setShowWin(false)}>New deal</Button>
        </>}>
          <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.4rem 1.5rem', margin: '1rem 0', fontSize: 'var(--text-sm)' }}>
            <dt style={{ opacity: 0.75 }}>Time</dt><dd style={{ fontWeight: 700, textAlign: 'right', margin: 0 }}>1:42</dd>
            <dt style={{ opacity: 0.75 }}>Moves</dt><dd style={{ fontWeight: 700, textAlign: 'right', margin: 0 }}>23</dd>
            <dt style={{ opacity: 0.75 }}>Score</dt><dd style={{ fontWeight: 700, textAlign: 'right', margin: 0 }}>95</dd>
            <dt style={{ opacity: 0.75 }}>Current streak</dt><dd style={{ fontWeight: 700, textAlign: 'right', margin: 0 }}>6 🔥</dd>
          </dl>
          <p style={{ margin: '0 0 0.2rem', padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-md)', background: 'rgb(255 217 94 / 0.14)', border: '1px solid var(--gold-veil)', fontSize: 'var(--text-sm)', color: 'var(--panel-text)' }}>
            🔥 Streak extended to 6! Come back tomorrow to keep it going.
          </p>
        </Dialog>
      )}
    </main>
  );
}
window.GameShell = GameShell;
