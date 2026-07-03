/* Original CardHearth menu artwork (subset of the site's GameArt), as a single
   <GameArt game="…" /> component. Faithful to the source: cream cards, one ink +
   one red suit, gold accents. Exposed on window for the other kit scripts. */
function GameArt({ game }) {
  const card = { fill: '#fcfcf7', stroke: '#1d2230', strokeOpacity: 0.3 };
  switch (game) {
    case 'klondike':
      return (
        <svg viewBox="0 0 240 135" className="art" aria-hidden="true">
          <g transform="translate(76 78) rotate(-16)"><rect x="-28" y="-39" width="56" height="78" rx="6" {...card}/><text x="-20" y="-22" fontSize="13" fontWeight="700" fill="#c2273a">Q</text><text x="0" y="12" fontSize="30" textAnchor="middle" fill="#c2273a">♦</text></g>
          <g transform="translate(120 68)"><rect x="-28" y="-39" width="56" height="78" rx="6" {...card}/><text x="-20" y="-22" fontSize="13" fontWeight="700" fill="#1d2230">A</text><text x="0" y="12" fontSize="30" textAnchor="middle" fill="#1d2230">♠</text></g>
          <g transform="translate(164 78) rotate(16)"><rect x="-28" y="-39" width="56" height="78" rx="6" {...card}/><text x="-20" y="-22" fontSize="13" fontWeight="700" fill="#c2273a">K</text><text x="0" y="12" fontSize="30" textAnchor="middle" fill="#c2273a">♥</text></g>
        </svg>
      );
    case 'spider':
      return (
        <svg viewBox="0 0 240 135" className="art" aria-hidden="true">
          <rect x="34" y="30" width="50" height="70" rx="6" fill="#a32934" stroke="#fff" strokeOpacity="0.6"/>
          <rect x="152" y="30" width="50" height="70" rx="6" fill="#a32934" stroke="#fff" strokeOpacity="0.6"/>
          <rect x="93" y="8" width="54" height="76" rx="6" {...card}/><text x="100" y="24" fontSize="12" fontWeight="700" fill="#1d2230">K♠</text>
          <rect x="93" y="34" width="54" height="76" rx="6" {...card}/><text x="100" y="50" fontSize="12" fontWeight="700" fill="#1d2230">Q♠</text>
          <rect x="93" y="60" width="54" height="76" rx="6" {...card}/><text x="100" y="76" fontSize="12" fontWeight="700" fill="#1d2230">J♠</text>
          <text x="120" y="112" fontSize="26" textAnchor="middle" fill="#1d2230">♠</text>
        </svg>
      );
    case 'freecell':
      return (
        <svg viewBox="0 0 240 135" className="art" aria-hidden="true">
          <g fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="2">
            <rect x="26" y="14" width="40" height="56" rx="5"/><rect x="76" y="14" width="40" height="56" rx="5"/><rect x="126" y="14" width="40" height="56" rx="5"/><rect x="176" y="14" width="40" height="56" rx="5"/>
          </g>
          <g transform="translate(96 47) rotate(-6)"><rect x="-20" y="-28" width="40" height="56" rx="5" {...card}/><text x="0" y="8" fontSize="20" textAnchor="middle" fill="#1d2230">♣</text></g>
          <g transform="translate(120 100) rotate(5)"><rect x="-26" y="-34" width="52" height="68" rx="6" {...card}/><text x="-18" y="-18" fontSize="12" fontWeight="700" fill="#c2273a">A</text><text x="0" y="10" fontSize="26" textAnchor="middle" fill="#c2273a">♥</text></g>
        </svg>
      );
    case 'pyramid':
      return (
        <svg viewBox="0 0 240 135" className="art" aria-hidden="true">
          {[[120,16],[102,44],[138,44],[84,72],[120,72],[156,72],[66,100],[102,100],[138,100],[174,100]].map(([x,y],i)=>(
            <rect key={i} x={x-15} y={y} width="30" height="42" rx="4" {...card}/>
          ))}
          <text x="120" y="44" fontSize="14" textAnchor="middle" fill="#1d2230">♠</text>
          <text x="66" y="128" fontSize="11" textAnchor="middle" fill="#c2273a">6♥</text>
          <text x="174" y="128" fontSize="11" textAnchor="middle" fill="#1d2230">7♣</text>
        </svg>
      );
    case 'hearts':
      return (
        <svg viewBox="0 0 240 135" className="art" aria-hidden="true">
          <g transform="translate(86 70) rotate(-14)"><rect x="-26" y="-37" width="52" height="74" rx="6" {...card}/><text x="-18" y="-19" fontSize="12" fontWeight="700" fill="#c2273a">A</text><text x="0" y="12" fontSize="28" textAnchor="middle" fill="#c2273a">♥</text></g>
          <g transform="translate(122 64)"><rect x="-26" y="-37" width="52" height="74" rx="6" {...card}/><text x="-18" y="-19" fontSize="12" fontWeight="700" fill="#1d2230">Q</text><text x="0" y="12" fontSize="28" textAnchor="middle" fill="#1d2230">♠</text></g>
          <g transform="translate(158 70) rotate(14)"><rect x="-26" y="-37" width="52" height="74" rx="6" {...card}/><text x="-18" y="-19" fontSize="12" fontWeight="700" fill="#c2273a">K</text><text x="0" y="12" fontSize="28" textAnchor="middle" fill="#c2273a">♥</text></g>
        </svg>
      );
    case 'gin':
      return (
        <svg viewBox="0 0 240 135" className="art" aria-hidden="true">
          {[0,1,2].map(i=>(<g key={'r'+i} transform={`translate(${66+i*20} 40)`}><rect x="-15" y="-22" width="30" height="44" rx="4" {...card}/><text x="0" y="6" fontSize="14" textAnchor="middle" fill="#c2273a">{['3','4','5'][i]}</text><text x="-9" y="-9" fontSize="8" fontWeight="700" fill="#c2273a">♥</text></g>))}
          {[0,1,2].map(i=>(<g key={'s'+i} transform={`translate(${120+i*20} 92)`}><rect x="-15" y="-22" width="30" height="44" rx="4" {...card}/><text x="0" y="6" fontSize="13" textAnchor="middle" fill="#1d2230">8</text><text x="-9" y="-9" fontSize="8" fontWeight="700" fill="#1d2230">{['♠','♣','♠'][i]}</text></g>))}
          <text x="120" y="126" fontSize="11" fontWeight="800" textAnchor="middle" fill="#ffd95e">run + set</text>
        </svg>
      );
    case 'sudoku':
      return (
        <svg viewBox="0 0 240 135" className="art" aria-hidden="true">
          <rect x="75" y="13" width="108" height="108" rx="6" {...card}/>
          <g stroke="#1d2230" strokeOpacity="0.18"><path d="M87 13v108M99 13v108M123 13v108M135 13v108M159 13v108M171 13v108"/><path d="M75 25h108M75 37h108M75 61h108M75 73h108M75 97h108M75 109h108"/></g>
          <g stroke="#1d2230" strokeOpacity="0.55" strokeWidth="2"><path d="M111 13v108M147 13v108M75 49h108M75 85h108"/></g>
          <g fontSize="10" fontWeight="700" fill="#1d2230"><text x="78.5" y="22.5">5</text><text x="114.5" y="22.5">7</text><text x="90.5" y="58.5">9</text><text x="138.5" y="70.5">4</text><text x="78.5" y="94.5">3</text></g>
          <g fontSize="10" fontWeight="700" fill="#2c5fa8"><text x="126.5" y="46.5">2</text><text x="102.5" y="82.5">6</text></g>
          <rect x="123" y="37" width="12" height="12" fill="#ffd95e" fillOpacity="0.45"/>
        </svg>
      );
    case 'mahjong':
      return (
        <svg viewBox="0 0 240 135" className="art" aria-hidden="true">
          {[[52,52,0],[86,52,0],[120,52,0],[154,52,0],[188,52,0],[69,86,0],[103,86,0],[137,86,0],[171,86,0],[95,30,1],[129,30,1]].map(([x,y,top],i)=>(
            <g key={i} transform={`translate(${x} ${y})`}><rect x="-14" y="-19" width="28" height="38" rx="3" fill={top?'#fffef8':'#efeadb'} stroke="#5a4b32" strokeOpacity="0.45"/><rect x="-12" y="17" width="28" height="3" rx="1.5" fill="#aa966e"/></g>
          ))}
          <text x="52" y="60" fontSize="15" textAnchor="middle" fill="#c2273a">中</text>
          <text x="120" y="60" fontSize="15" textAnchor="middle" fill="#2c5fa8">●</text>
          <text x="95" y="38" fontSize="15" textAnchor="middle" fill="#1d2230">東</text>
          <text x="171" y="94" fontSize="15" textAnchor="middle" fill="#1d7a45">春</text>
        </svg>
      );
    case '2048':
      return (
        <svg viewBox="0 0 240 135" className="art" aria-hidden="true">
          <rect x="62" y="11" width="116" height="116" rx="8" fill="#1d2230" fillOpacity="0.35"/>
          {[[68,17,'2','#efe4ce','#43320a'],[125,17,'8','#f2b179','#fff'],[68,74,'4','#ece0c2','#43320a'],[125,74,'16','#f59563','#fff']].map(([x,y,l,bg,fg],i)=>(
            <g key={i}><rect x={x} y={y} width="47" height="47" rx="5" fill={bg}/><text x={x+23.5} y={y+31} fontSize="20" fontWeight="800" textAnchor="middle" fill={fg}>{l}</text></g>
          ))}
          <text x="198" y="75" fontSize="22" textAnchor="middle" fill="#ffd95e">→</text>
          <text x="40" y="75" fontSize="22" textAnchor="middle" fill="#ffd95e">←</text>
        </svg>
      );
    case 'daily':
      return (
        <svg viewBox="0 0 240 135" className="art" aria-hidden="true">
          <rect x="60" y="22" width="92" height="92" rx="10" {...card}/>
          <rect x="60" y="22" width="92" height="26" rx="10" fill="#c2273a"/><rect x="60" y="38" width="92" height="10" fill="#c2273a"/>
          <circle cx="82" cy="22" r="4" {...card}/><circle cx="130" cy="22" r="4" {...card}/>
          <text x="106" y="92" fontSize="34" fontWeight="700" textAnchor="middle" fill="#1d2230">13</text>
          <g transform="translate(170 78) rotate(12)"><rect x="-26" y="-36" width="52" height="72" rx="6" {...card}/><text x="-18" y="-18" fontSize="12" fontWeight="700" fill="#c2273a">A</text><text x="0" y="10" fontSize="26" textAnchor="middle" fill="#c2273a">♦</text></g>
          <text x="44" y="40" fontSize="16" fill="#ffd95e">★</text>
        </svg>
      );
    default:
      return null;
  }
}
window.GameArt = GameArt;
