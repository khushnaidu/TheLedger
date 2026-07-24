import { useState, useRef, useEffect } from 'react';
import { Power, ChevronLeft, ChevronRight } from 'lucide-react';

// The channel lineup. Add a channel: { name: 'MTV', src: 'https://www.youtube.com/embed/VIDEO_ID?autoplay=1' }
// (playlists: 'https://www.youtube.com/embed/videoseries?list=PLAYLIST_ID&autoplay=1')
const CHANNELS = [
  { name: 'French Touch', src: 'https://www.youtube.com/embed/-AgKZEBkDFA?autoplay=1' },
  { name: 'Frutiger Aero', src: 'https://www.youtube.com/embed/Cz2YCRmDOFk?autoplay=1' },
  { name: 'Batman Noir Jazz', src: 'https://www.youtube.com/embed/OQJ9_HHRWis?autoplay=1' },
  { name: 'Bloomer Brasil', src: 'https://www.youtube.com/embed/7fVNudsMzgE?autoplay=1' },
  { name: 'City Pop', src: 'https://www.youtube.com/embed/1XD8yUW1Yvc?autoplay=1' },
  { name: 'Modern RnB', src: 'https://www.youtube.com/embed/dHU8B76kR_s?autoplay=1' },
];

export default function TvSet() {
  const [channel, setChannel] = useState(0);
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
  const prevChannel = () => changeChannel(powered ? (channel - 1 + CHANNELS.length) % CHANNELS.length : channel);

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
        <button type="button" className="win-btn win-btn-sm win-btn-ico" onClick={prevChannel} title="Prev channel">
          <ChevronLeft size={10} strokeWidth={3} />
        </button>
        <button type="button" className="win-btn win-btn-sm win-btn-ico" onClick={nextChannel} title="Next channel">
          <ChevronRight size={10} strokeWidth={3} />
        </button>
        <button type="button" className="win-btn win-btn-sm" onClick={openBig}>Big Screen</button>
      </div>

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
