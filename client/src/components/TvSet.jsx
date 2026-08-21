import { useState, useRef, useEffect } from 'react';
import { Power, List, X } from 'lucide-react';
import { api } from '../api';

// The built-in lineup. Playlists: 'https://www.youtube.com/embed/videoseries?list=PLAYLIST_ID&autoplay=1'
const BUILTIN_CHANNELS = [
  { name: 'French Touch', src: 'https://www.youtube.com/embed/-AgKZEBkDFA?autoplay=1' },
  { name: 'Frutiger Aero', src: 'https://www.youtube.com/embed/Cz2YCRmDOFk?autoplay=1' },
  { name: 'Batman Noir Jazz', src: 'https://www.youtube.com/embed/OQJ9_HHRWis?autoplay=1' },
  { name: 'Bloomer Brasil', src: 'https://www.youtube.com/embed/7fVNudsMzgE?autoplay=1' },
  { name: 'City Pop', src: 'https://www.youtube.com/embed/1XD8yUW1Yvc?autoplay=1' },
  { name: 'Modern RnB', src: 'https://www.youtube.com/embed/dHU8B76kR_s?autoplay=1' },
];

const CUSTOM_KEY = 'ledger_tv_channels'; // legacy browser-local storage, migrated to the account on load

// Accepts watch/share/shorts/live/embed/playlist YouTube links → embed src, or null if unrecognized
function toEmbedSrc(raw) {
  let u;
  try { u = new URL(raw.trim()); } catch { return null; }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  if (!['youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(host)) return null;
  const list = u.searchParams.get('list');
  if (list && /^[\w-]+$/.test(list)) {
    return `https://www.youtube.com/embed/videoseries?list=${list}&autoplay=1`;
  }
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (/^\/(embed|shorts|live)\//.test(u.pathname)) id = u.pathname.split('/')[2];
  else id = u.searchParams.get('v');
  if (!id || !/^[\w-]{6,20}$/.test(id)) return null;
  return `https://www.youtube.com/embed/${id}?autoplay=1`;
}

export default function TvSet() {
  const [channel, setChannel] = useState(0);
  const [customChannels, setCustomChannels] = useState([]);
  const [managing, setManaging] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftUrl, setDraftUrl] = useState('');
  const [draftError, setDraftError] = useState(null);
  const [adding, setAdding] = useState(false);

  const CHANNELS = [...BUILTIN_CHANNELS, ...customChannels];

  // channels live on the account; sweep any pre-account browser-local ones into it once
  useEffect(() => {
    api.getChannels().then(async (chs) => {
      const migrated = [];
      try {
        const local = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
        if (Array.isArray(local)) {
          for (const c of local.filter((c) => c?.name && c?.src)) {
            try { migrated.push(await api.addChannel({ name: c.name, src: c.src })); } catch { /* skip */ }
          }
        }
      } catch { /* corrupted legacy value */ }
      localStorage.removeItem(CUSTOM_KEY);
      setCustomChannels([...chs, ...migrated]);
    }).catch(() => {});
  }, []);

  const addCustomChannel = async () => {
    if (adding) return;
    const src = toEmbedSrc(draftUrl);
    if (!src) { setDraftError('bad link — paste a youtube video or playlist url'); return; }
    const name = draftName.trim().slice(0, 20) || `CH ${CHANNELS.length + 1}`;
    setAdding(true);
    try {
      const saved = await api.addChannel({ name, src });
      setCustomChannels((cs) => [...cs, saved]);
      setDraftName(''); setDraftUrl(''); setDraftError(null);
    } catch (err) {
      setDraftError(err.message);
    }
    setAdding(false);
  };

  const removeCustomChannel = async (id) => {
    const absolute = CHANNELS.findIndex((c) => c.id === id);
    try { await api.deleteChannel(id); } catch { return; }
    setCustomChannels((cs) => cs.filter((c) => c.id !== id));
    setChannel((c) => (c === absolute ? 0 : c > absolute ? c - 1 : c));
  };
  const [powered, setPowered] = useState(false);
  const [tuning, setTuning] = useState(false);
  const [big, setBig] = useState(false);
  const timerRef = useRef(null);
  const frameRef = useRef(null);
  const playTimeRef = useRef(0);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  // YT streams currentTime via infoDelivery once we send the listening handshake
  useEffect(() => {
    const onMsg = (e) => {
      if (!/youtube/.test(e.origin)) return;
      try {
        const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (d?.info?.currentTime !== undefined) playTimeRef.current = d.info.currentTime;
      } catch { /* not ours */ }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // Escape closes the big screen
  useEffect(() => {
    if (!big) return;
    const onKey = (e) => { if (e.key === 'Escape') setBig(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [big]);

  const changeChannel = (i) => {
    if (powered && i === channel) return;
    setPowered(true);
    setTuning(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setChannel(i);
      setTuning(false);
    }, 650);
  };

  const nextChannel = () => changeChannel(powered ? (channel + 1) % CHANNELS.length : channel);

  const openBig = () => {
    if (!powered) changeChannel(channel);
    setBig(true);
  };

  const togglePower = () => {
    if (powered) {
      clearTimeout(timerRef.current);
      setPowered(false);
      setTuning(false);
      setBig(false);
    } else {
      changeChannel(channel);
    }
  };

  const post = (msg) => {
    frameRef.current?.contentWindow?.postMessage(
      JSON.stringify({ ...msg, id: 'ledgertv', channel: 'widget' }), '*'
    );
  };

  const skip30 = () => post({ event: 'command', func: 'seekTo', args: [playTimeRef.current + 30, true] });

  const current = CHANNELS[channel];

  return (
    <div className="tv-set">
      {big && <div className="tv-overlay" onClick={() => setBig(false)} />}

      {/* ONE tv, ONE iframe — going big is pure CSS, so playback never restarts */}
      <div className={`tv-photo-wrap ${big ? 'tv-photo-big' : ''}`}>
        <img src="/art/actual_tv.png" alt="" className="tv-chassis" />
        <div className="tv-screen-cut">
          {powered && !tuning && (
            <iframe
              ref={frameRef}
              src={`${current.src}&enablejsapi=1`}
              title={`channel ${current.name}`}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              onLoad={() => post({ event: 'listening' })}
            />
          )}
          {(tuning || !powered) && <div className="tv-static" />}
        </div>
        {big && (
          <div className="tv-big-controls">
            <button type="button" className="win-btn" onClick={nextChannel}>Next Channel</button>
            <button type="button" className="win-btn" onClick={skip30} disabled={tuning}>Skip +30s</button>
            <span className="tv-big-hint">hover the screen to scrub · esc to close</span>
          </div>
        )}
      </div>

      {/* grey 90s buttons */}
      <div className="tv-btn-row">
        <button type="button" className="win-btn win-btn-sm win-btn-ico" onClick={togglePower} title="Power">
          <Power size={10} strokeWidth={3} />
        </button>
        <button type="button" className="win-btn win-btn-sm win-btn-ico" onClick={() => setManaging((m) => !m)} title="Channel guide">
          <List size={10} strokeWidth={3} />
        </button>
        <button type="button" className="win-btn win-btn-sm" onClick={openBig}>Big Screen</button>
      </div>

      {managing && (
        <div className="tv-tuner">
          <p className="tv-tuner-title">Channel Guide</p>
          <div className="tv-tuner-list">
            {CHANNELS.map((c, i) => (
              <div key={c.id || c.src} className="tv-tuner-row">
                <button
                  type="button"
                  className={`tv-tuner-tune ${powered && i === channel ? 'tv-tuner-current' : ''}`}
                  onClick={() => changeChannel(i)}
                >
                  <span className="tv-tuner-num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="tv-tuner-name">{c.name}</span>
                </button>
                {c.id && (
                  <button type="button" className="win-btn win-btn-sm win-btn-ico" onClick={() => removeCustomChannel(c.id)} title={`Remove ${c.name}`}>
                    <X size={8} strokeWidth={3} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            maxLength={20}
            placeholder="channel name (max 20)"
            className="tv-tuner-input"
          />
          <input
            type="text"
            value={draftUrl}
            onChange={(e) => { setDraftUrl(e.target.value); setDraftError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') addCustomChannel(); }}
            placeholder="youtube link"
            className="tv-tuner-input"
          />
          {draftError && <p className="tv-tuner-error">{draftError}</p>}
          <button type="button" className="win-btn win-btn-sm w-full" onClick={addCustomChannel} disabled={!draftUrl.trim()}>
            Add Channel
          </button>
        </div>
      )}

      <div className="tv-status-row">
        <span className="tv-brand">Ledgervision</span>
        <span className="tv-channel-name">
          {tuning ? '— — —' : powered ? current.name : 'standby'}
        </span>
        <span className={`tv-power ${powered && !tuning ? 'tv-power-on' : ''}`} />
      </div>
    </div>
  );
}
