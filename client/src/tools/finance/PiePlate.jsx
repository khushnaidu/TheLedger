
// A printed plate, not a chart widget. Every heading owns a photographed pie,
// and its wedge is that photograph clipped to its own share — so the plate is
// one pie assembled out of eight. A hairline rule cuts between them, a whisper
// of halftone sits over the photographs the way a paper prints one, leader
// lines run out to the labels, and a second plate is laid down a hair off
// register in red. Headings with no photograph fall back to a spot colour and
// a screen, which is what the whole plate looked like before the pies.
//
// The photographs in /art/pie are normalised square with the pie centred at
// radius = half the width, which is why they need no per-file placement.

const W = 560;
const H = 332;
const CX = 280;
const CY = 160;
const R = 122;
const LIFT = 13; // how far a slice pulls out of the plate when chosen

const TAU = Math.PI * 2;
const pt = (r, a) => [CX + r * Math.cos(a), CY + r * Math.sin(a)];

function wedge(a0, a1, r = R) {
  const [x0, y0] = pt(r, a0);
  const [x1, y1] = pt(r, a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${CX} ${CY} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
}

function Screens() {
  return (
    <defs>
      <pattern id="fin-hatch" width="7" height="7" patternUnits="userSpaceOnUse">
        <path d="M -1 1 L 1 -1 M 0 7 L 7 0 M 6 8 L 8 6" stroke="#111" strokeWidth="1.3" />
      </pattern>
      <pattern id="fin-hatchb" width="7" height="7" patternUnits="userSpaceOnUse">
        <path d="M -1 6 L 1 8 M 0 0 L 7 7 M 6 -1 L 8 1" stroke="#111" strokeWidth="1.3" />
      </pattern>
      <pattern id="fin-cross" width="7" height="7" patternUnits="userSpaceOnUse">
        <path d="M 0 7 L 7 0 M 0 0 L 7 7" stroke="#111" strokeWidth="1" />
      </pattern>
      <pattern id="fin-dots" width="7" height="7" patternUnits="userSpaceOnUse">
        <circle cx="3.5" cy="3.5" r="1.7" fill="#111" />
      </pattern>
      <pattern id="fin-vert" width="6" height="6" patternUnits="userSpaceOnUse">
        <path d="M 2 0 L 2 6" stroke="#111" strokeWidth="1.7" />
      </pattern>
      <pattern id="fin-horz" width="6" height="6" patternUnits="userSpaceOnUse">
        <path d="M 0 2 L 6 2" stroke="#111" strokeWidth="1.7" />
      </pattern>
      <pattern id="fin-stipple" width="9" height="9" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="0.9" fill="#111" />
        <circle cx="6.5" cy="6" r="0.8" fill="#111" />
      </pattern>
      <pattern id="fin-ink" width="4" height="4" patternUnits="userSpaceOnUse">
        <rect width="4" height="4" fill="#111" />
      </pattern>
    </defs>
  );
}

export default function PiePlate({ slices, active, onPick, month }) {
  if (!slices.length) {
    return (
      <div className="fin-plate fin-plate-bare">
        <p className="t-label">Nothing was spent in {month}</p>
        <p className="fin-empty-sub">Import a statement, or write a line by hand.</p>
      </div>
    );
  }

  // cumulative rather than a running mutation — at most seven slices, so
  // the extra pass costs nothing and the render stays pure
  const cut = slices.map((s, i) => {
    const before = slices.slice(0, i).reduce((a, x) => a + x.share, 0);
    const a0 = -Math.PI / 2 + before * TAU;
    const a1 = a0 + s.share * TAU;
    return { ...s, a0, a1, mid: (a0 + a1) / 2 };
  });

  const whole = cut.length === 1;

  return (
    <div className="fin-plate">
      <svg viewBox={`0 0 ${W} ${H}`} className="fin-plate-svg" role="img"
        aria-label={`Disposition of funds for ${month}`}>
        <Screens />

        {/* the second plate, a hair out of register */}
        <g transform="translate(2.4 2.4)" opacity="0.13">
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--stamp)" strokeWidth="2.5" />
          {!whole && cut.map((s) => {
            const [x, y] = pt(R, s.a0);
            return <line key={s.id} x1={CX} y1={CY} x2={x} y2={y} stroke="var(--stamp)" strokeWidth="2" />;
          })}
        </g>

        {/* one clip per wedge, so each heading's pie is cut to its own share */}
        <defs>
          {cut.map((s) => (
            <clipPath key={s.id} id={`fin-cut-${s.id}`}>
              {whole
                ? <circle cx={CX} cy={CY} r={R} />
                : <path d={wedge(s.a0, s.a1)} />}
            </clipPath>
          ))}
        </defs>

        {cut.map((s) => {
          const on = active === s.id;
          const [dx, dy] = on ? [Math.cos(s.mid) * LIFT, Math.sin(s.mid) * LIFT] : [0, 0];
          const outline = whole
            ? <circle cx={CX} cy={CY} r={R} fill="none" stroke="#111" strokeWidth="1.25" />
            : <path d={wedge(s.a0, s.a1)} fill="none" stroke="#111" strokeWidth="1.25" />;
          return (
            <g
              key={s.id}
              className={`fin-slice ${on ? 'fin-slice-on' : ''}`}
              transform={`translate(${dx.toFixed(2)} ${dy.toFixed(2)})`}
              onClick={() => onPick(on ? null : s.id)}
            >
              {s.photo ? (
                <>
                  {/* the clip lives inside this transform, so it travels with
                      the wedge when the slice is pulled out */}
                  <g clipPath={`url(#fin-cut-${s.id})`}>
                    <image href={s.photo} x={CX - R} y={CY - R} width={R * 2} height={R * 2} />
                    {/* a whisper of halftone, the way a paper prints a photograph */}
                    <rect x={CX - R} y={CY - R} width={R * 2} height={R * 2}
                      fill="url(#fin-dots)" opacity="0.1" />
                  </g>
                  {outline}
                </>
              ) : whole ? (
                <>
                  <circle cx={CX} cy={CY} r={R} fill={s.ink} opacity="0.82" />
                  <circle cx={CX} cy={CY} r={R} fill={`url(#fin-${s.screen})`} opacity="0.26" />
                  {outline}
                </>
              ) : (
                <>
                  <path d={wedge(s.a0, s.a1)} fill={s.ink} opacity="0.82" />
                  <path d={wedge(s.a0, s.a1)} fill={`url(#fin-${s.screen})`} opacity="0.26" />
                  {outline}
                </>
              )}
            </g>
          );
        })}

        {/* leader lines and labels, only where a slice is wide enough to earn one */}
        {cut.filter((s) => s.share >= 0.045).map((s) => {
          const on = active === s.id;
          const push = on ? LIFT : 0;
          const [lx, ly] = pt(R + push + 2, s.mid);
          const [ex, ey] = pt(R + push + 17, s.mid);
          const right = Math.cos(s.mid) >= 0;
          const tx = right ? ex + 13 : ex - 13;
          return (
            <g key={s.id} className={`fin-lead ${on ? 'fin-lead-on' : ''}`} onClick={() => onPick(on ? null : s.id)}>
              <path
                d={`M ${lx.toFixed(1)} ${ly.toFixed(1)} L ${ex.toFixed(1)} ${ey.toFixed(1)} L ${tx.toFixed(1)} ${ey.toFixed(1)}`}
                fill="none" stroke="#111" strokeWidth="0.9"
              />
              <text
                x={right ? tx + 4 : tx - 4} y={ey - 1}
                textAnchor={right ? 'start' : 'end'}
                className="fin-lead-name"
              >{s.label}</text>
              <text
                x={right ? tx + 4 : tx - 4} y={ey + 10}
                textAnchor={right ? 'start' : 'end'}
                className="fin-lead-share"
              >{(s.share * 100).toFixed(1)}%</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
