import { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X, Plus, Loader2, Search } from 'lucide-react';
import { api } from '../api';

// art of the month — a real wall calendar always has a picture up top
const MONTH_ART = [
  '/art/calendar/january1.jpg',
  '/art/calendar/february.jpg',
  '/art/calendar/march.jpg',
  '/art/calendar/april.jpg',
  '/art/calendar/may1.jpg',
  '/art/calendar/june.jpg',
  '/art/calendar/july.jpg',
  '/art/calendar/august.jpg',
  '/art/calendar/september.jpg',
  '/art/calendar/october.jpg',
  '/art/calendar/november.jpg',
  '/art/calendar/december.jpg',
];

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad2 = (n) => String(n).padStart(2, '0');

// seeded PRNG — the marker wobble stays put between renders of the same month
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a line drawn by a human hand: short segments, each a little off
function markerPath(rnd, x1, y1, x2, y2) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const segs = Math.max(4, Math.round(len / 55));
  let d = `M ${(x1 + (rnd() - 0.5) * 2).toFixed(1)} ${(y1 + (rnd() - 0.5) * 2).toFixed(1)}`;
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const jx = x1 + (x2 - x1) * t + (rnd() - 0.5) * 3.2;
    const jy = y1 + (y2 - y1) * t + (rnd() - 0.5) * 3.2;
    d += ` L ${jx.toFixed(1)} ${jy.toFixed(1)}`;
  }
  return d;
}

// the month grid, hand-ruled in marker
function MarkerGrid({ rows, seed }) {
  const paths = useMemo(() => {
    const rnd = mulberry32(seed);
    const W = 770, CH = 110;
    const out = [];
    for (let c = 0; c <= 7; c++) out.push({ d: markerPath(rnd, c * 110, 0, c * 110, rows * CH), w: 1.8 + rnd() * 1.2 });
    for (let r = 0; r <= rows; r++) out.push({ d: markerPath(rnd, 0, r * CH, W, r * CH), w: 1.8 + rnd() * 1.2 });
    return out;
  }, [rows, seed]);
  return (
    <svg className="wall-ink" viewBox={`0 0 770 ${rows * 110}`} preserveAspectRatio="none" aria-hidden="true">
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill="none" stroke="var(--wall-ink)" strokeWidth={p.w} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

// a hand-drawn frame, for boxing the art of the month
function MarkerBox({ seed }) {
  const paths = useMemo(() => {
    const rnd = mulberry32(seed);
    const W = 700, H = 400;
    return [
      { d: markerPath(rnd, 0, 0, W, 0), w: 2.5 },
      { d: markerPath(rnd, W, 0, W, H), w: 2.1 },
      { d: markerPath(rnd, W, H, 0, H), w: 2.7 },
      { d: markerPath(rnd, 0, H, 0, 0), w: 2.2 },
    ];
  }, [seed]);
  return (
    <svg className="wall-ink" viewBox="0 0 700 400" preserveAspectRatio="none" aria-hidden="true">
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill="none" stroke="var(--wall-ink)" strokeWidth={p.w} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function buildCells(y, m) {
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const prevDays = new Date(y, m, 0).getDate();
  const total = Math.ceil((first + days) / 7) * 7;
  const cells = [];
  for (let i = 0; i < total; i++) {
    const dayNum = i - first + 1;
    if (dayNum < 1) {
      const d = prevDays + dayNum;
      const yy = m === 0 ? y - 1 : y;
      const mm = m === 0 ? 11 : m - 1;
      cells.push({ day: d, date: `${yy}-${pad2(mm + 1)}-${pad2(d)}`, ghost: true });
    } else if (dayNum > days) {
      const d = dayNum - days;
      const yy = m === 11 ? y + 1 : y;
      const mm = m === 11 ? 0 : m + 1;
      cells.push({ day: d, date: `${yy}-${pad2(mm + 1)}-${pad2(d)}`, ghost: true });
    } else {
      cells.push({ day: dayNum, date: `${y}-${pad2(m + 1)}-${pad2(dayNum)}`, ghost: false });
    }
  }
  return cells;
}

// The day sheet — slides in from the right when a day is opened
function DaySheet({ date, events, onClose, onChanged }) {
  const [title, setTitle] = useState('');
  const [gifQuery, setGifQuery] = useState('');
  const [gifResults, setGifResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [giphyDown, setGiphyDown] = useState(false);
  const [chosenImage, setChosenImage] = useState(null);
  const [urlInput, setUrlInput] = useState('');
  const [saving, setSaving] = useState(false);

  const d = new Date(date + 'T00:00:00');
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });

  const searchGifs = async () => {
    if (!gifQuery.trim()) return;
    setSearching(true);
    try {
      setGifResults(await api.searchGiphy(gifQuery));
    } catch (err) {
      if (/not configured/i.test(err.message)) setGiphyDown(true);
      setGifResults([]);
    }
    setSearching(false);
  };

  const save = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await api.createEvent({ title, date, imageUrl: chosenImage || urlInput.trim() || null });
      setTitle(''); setChosenImage(null); setUrlInput(''); setGifResults([]); setGifQuery('');
      onChanged();
    } catch (err) { console.error(err); }
    setSaving(false);
  };

  const remove = async (id) => {
    try { await api.deleteEvent(id); onChanged(); } catch (err) { console.error(err); }
  };

  return (
    <div className="day-sheet">
      <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-[var(--ink)]">
        <div>
          <p className="t-label mb-2">{weekday}</p>
          <p style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '2.4rem', lineHeight: 1 }}>
            {date.slice(8)}<span className="text-[0.875rem] ml-2 align-top" style={{ color: 'var(--ink-30)' }}>{MONTH_NAMES[Number(date.slice(5, 7)) - 1]}</span>
          </p>
        </div>
        <button type="button" onClick={onClose} className="gus-collapse-btn">
          <X className="w-3 h-3" strokeWidth={3} /> Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {events.length > 0 ? (
          <div className="mb-8">
            <p className="t-label mb-3">On the wall</p>
            {events.map((ev) => (
              <div key={ev.id} className="flex items-center gap-3 py-2.5 border-b border-[var(--ink-08)]">
                {ev.imageUrl && <img src={ev.imageUrl} alt="" className="w-9 h-9 object-cover border border-[var(--line)]" />}
                <div className="flex-1 min-w-0">
                  <p className="text-[0.75rem] truncate" style={{ textTransform: 'none' }}>{ev.title}</p>
                  {ev.source !== 'manual' && (
                    <p className="text-[0.4375rem] tracking-[0.16em] uppercase text-[var(--ink-30)]">via {ev.source}</p>
                  )}
                </div>
                {ev.source === 'manual' && (
                  <button type="button" onClick={() => remove(ev.id)} className="btn-ghost p-1" title="Remove">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="t-small mb-8">Nothing on this day yet.</p>
        )}

        <p className="t-label mb-3">Pin something</p>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
          placeholder="What's happening?"
          className="input-field w-full mb-4 text-[0.75rem]"
        />

        {chosenImage ? (
          <div className="mb-4">
            <div className="relative inline-block">
              <img src={chosenImage} alt="" className="max-h-[110px] border border-[var(--line)]" />
              <button
                type="button"
                onClick={() => setChosenImage(null)}
                className="absolute -top-2 -right-2 bg-black text-white p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        ) : !giphyDown ? (
          <div className="mb-4">
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={gifQuery}
                onChange={(e) => setGifQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchGifs(); } }}
                placeholder="Search Giphy for a gif..."
                className="input-field flex-1 text-[0.625rem]"
              />
              <button type="button" onClick={searchGifs} className="btn-black px-3" disabled={searching}>
                {searching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
              </button>
            </div>
            {gifResults.length > 0 && (
              <div className="grid grid-cols-3 gap-1.5">
                {gifResults.map((g) => (
                  <button key={g.id} type="button" onClick={() => setChosenImage(g.url)} className="border border-[var(--ink-08)] hover:border-[var(--ink)] transition-colors">
                    <img src={g.preview} alt="" className="w-full h-[64px] object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Paste an image/gif URL (Giphy key not set)"
            className="input-field w-full mb-4 text-[0.625rem]"
            style={{ textTransform: 'none' }}
          />
        )}

        <button
          type="button"
          onClick={save}
          disabled={saving || !title.trim()}
          className="btn-black w-full justify-center py-3 disabled:opacity-20 disabled:cursor-not-allowed"
        >
          <Plus className="w-3 h-3" strokeWidth={3} /> {saving ? 'Pinning...' : 'Pin to the wall'}
        </button>
      </div>
    </div>
  );
}

export default function MyWall() {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [events, setEvents] = useState([]);
  const [openDate, setOpenDate] = useState(null);
  const [flip, setFlip] = useState(null); // 'out' → month swaps → 'in'
  const [feeds, setFeeds] = useState([]);
  const [feedUrl, setFeedUrl] = useState('');
  const [feedBusy, setFeedBusy] = useState(false);
  const [feedError, setFeedError] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const monthKey = `${cursor.y}-${pad2(cursor.m + 1)}`;
  const seed = cursor.y * 12 + cursor.m;
  const today = localToday();
  const cells = useMemo(() => buildCells(cursor.y, cursor.m), [cursor]);

  const load = useCallback(() => {
    api.getEvents(monthKey).then(setEvents).catch(console.error);
  }, [monthKey]);

  useEffect(() => { load(); }, [load]);

  const loadFeeds = () => api.getFeeds().then(setFeeds).catch(() => {});

  // On arrival: refresh stale feeds, then repaint with whatever came in
  useEffect(() => {
    loadFeeds();
    api.syncFeeds()
      .then((results) => { if (results.some((r) => r.synced !== undefined)) { load(); loadFeeds(); } })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addFeed = async () => {
    if (!feedUrl.trim() || feedBusy) return;
    setFeedBusy(true);
    setFeedError(null);
    try {
      await api.addFeed({ url: feedUrl });
      setFeedUrl('');
      loadFeeds();
      load();
    } catch (err) {
      setFeedError(err.message);
    }
    setFeedBusy(false);
  };

  const removeFeed = async (id) => {
    try { await api.deleteFeed(id); loadFeeds(); load(); } catch (err) { console.error(err); }
  };

  const syncNow = async () => {
    if (syncing) return;
    setSyncing(true);
    try { await api.syncFeeds(true); load(); loadFeeds(); } catch (err) { console.error(err); }
    setSyncing(false);
  };

  const byDate = useMemo(() => {
    const map = {};
    events.forEach((ev) => { (map[ev.date] = map[ev.date] || []).push(ev); });
    return map;
  }, [events]);

  const shift = (delta) => {
    if (flip) return; // one flip at a time
    setFlip('out');
    setTimeout(() => {
      setCursor(({ y, m }) => {
        const next = m + delta;
        if (next < 0) return { y: y - 1, m: 11 };
        if (next > 11) return { y: y + 1, m: 0 };
        return { y, m: next };
      });
      setFlip('in');
      setTimeout(() => setFlip(null), 520);
    }, 240);
  };

  return (
    <div className="max-w-[880px] stagger relative">
      <div className="flex items-end justify-between pt-10 mb-8">
        <div>
          <p className="t-label mb-4">Special occasions</p>
          <h1 className="t-display">My Wall</h1>
        </div>
        <p className="t-label pb-1">Nothing due here. Only days worth circling.</p>
      </div>

      {/* The calendar — a hand-drawn page taped to the wall */}
      <div className="wall-flip-stage">
      <div className={`wall-cal mb-4 ${flip === 'out' ? 'wall-flip-out' : ''} ${flip === 'in' ? 'wall-flip-in' : ''}`}>
        <span className="wall-tape wall-tape-l" />
        <span className="wall-tape wall-tape-r" />

        <div className="wall-art">
          <img src={MONTH_ART[cursor.m]} alt="" />
          <MarkerBox seed={seed + 99} />
        </div>

        <div className="wall-masthead">
          <button type="button" onClick={() => shift(-1)} className="wall-nav" title="Previous month">
            <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
            {MONTH_NAMES[(cursor.m + 11) % 12].slice(0, 3)}
          </button>
          <div className="flex items-baseline gap-3">
            <span className="wall-month">{MONTH_NAMES[cursor.m]}</span>
            <span className="wall-year">{cursor.y}</span>
          </div>
          <button type="button" onClick={() => shift(1)} className="wall-nav" title="Next month">
            {MONTH_NAMES[(cursor.m + 1) % 12].slice(0, 3)}
            <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>

        <div className="wall-weekdays">
          {WEEKDAYS.map((w, i) => (
            <span key={w} className={i === 0 ? 'wall-sun' : ''}>{w}</span>
          ))}
        </div>

        <div className="wall-grid-wrap">
          <MarkerGrid rows={cells.length / 7} seed={seed} />
          <div className="wall-grid">
            {cells.map((cell, i) => {
              const dayEvents = byDate[cell.date] || [];
              const photo = dayEvents.find((ev) => ev.imageUrl);
              const isToday = cell.date === today;
              return (
                <div
                  key={cell.date + i}
                  className={`wall-day ${cell.ghost ? 'wall-ghost' : ''}`}
                  onClick={() => !cell.ghost && setOpenDate(cell.date)}
                >
                  <span className={`wall-day-num ${i % 7 === 0 ? 'wall-sun' : ''} ${isToday ? 'wall-today' : ''}`}>
                    {cell.day}
                  </span>
                  {i === 0 && cell.ghost && <span className="wall-notes">notes:</span>}
                  {photo && (
                    <span className="wall-photo-wrap">
                      <img src={photo.imageUrl} alt="" className="wall-photo" />
                    </span>
                  )}
                  <div className="wall-day-events">
                    {dayEvents.slice(0, 2).map((ev) => (
                      <p key={ev.id} className="wall-event" title={ev.title}>{ev.title}</p>
                    ))}
                    {dayEvents.length > 2 && (
                      <p className="wall-event wall-event-more">+{dayEvents.length - 2} more</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      </div>

      <p className="fig-caption mb-12 text-center">
        fig. the wall — click a day to pin an occasion. gifs welcome.
      </p>

      {/* Wired calendars — same sketch hand, straight on the page */}
      <div className="wall-feeds max-w-[560px] mx-auto mb-16">
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <p className="wall-feeds-title">wired calendars</p>
            {feeds.length > 0 && (
              <button type="button" onClick={syncNow} className="wall-hand-link" disabled={syncing}>
                {syncing ? 'syncing...' : 'sync now'}
              </button>
            )}
          </div>

          {feeds.map((feed) => (
            <div key={feed.id} className="wall-feed-row">
              <span className="wall-feed-kind">{feed.kind}</span>
              <span className="flex-1 min-w-0 truncate" style={{ textTransform: 'none', opacity: 0.75 }}>
                {feed.label || feed.url}
              </span>
              {feed.lastSyncedAt && (
                <span className="whitespace-nowrap" style={{ fontSize: '0.75rem', opacity: 0.45 }}>
                  synced {new Date(feed.lastSyncedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <button type="button" onClick={() => removeFeed(feed.id)} className="wall-feed-x" title="Disconnect">
                <X className="w-3.5 h-3.5" strokeWidth={2.5} />
              </button>
            </div>
          ))}

          <div className="flex items-end gap-3 mt-3">
            <input
              type="text"
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addFeed(); }}
              placeholder="paste a calendar address..."
              className="wall-input flex-1"
            />
            <button
              type="button"
              onClick={addFeed}
              disabled={feedBusy || !feedUrl.trim()}
              className="wall-btn"
            >
              {feedBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'connect'}
            </button>
          </div>
          {feedError && (
            <p className="mt-2" style={{ color: 'var(--stamp)', textTransform: 'none', fontSize: '0.85rem' }}>{feedError}</p>
          )}

          <div className="flex gap-5 mt-3">
            <a href="https://calendar.google.com/calendar/u/0/r/settings" target="_blank" rel="noreferrer" className="wall-hand-link">
              google cal settings ↗
            </a>
            <a href="https://www.icloud.com/calendar" target="_blank" rel="noreferrer" className="wall-hand-link">
              icloud calendar ↗
            </a>
          </div>

          <p className="wall-feeds-help">
            google: settings → your calendar → "secret address in iCal format".
            apple: icloud → share calendar → public calendar → copy the webcal link.
            events land on the wall automatically; birthdays repeat every year.
          </p>
        </div>
      </div>

      {openDate && (
        <DaySheet
          date={openDate}
          events={byDate[openDate] || []}
          onClose={() => setOpenDate(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
