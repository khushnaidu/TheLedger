import { useState, useRef, useEffect } from 'react';

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
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

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

  const current = CHANNELS[channel];

  return (
    <div className="tv-set ledger-only">
      {/* the player sits behind the photo; the screen hole in tv.png reveals it */}
      <div className="tv-photo-wrap">
        <img src="/art/actual_tv.png" alt="" className="tv-chassis" />
        <div className="tv-screen-cut">
          {powered && !tuning && (
            <iframe
              src={current.src}
              title={`channel ${current.name}`}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          )}
          {tuning && <div className="tv-static" />}
          {!powered && !tuning && <div className="tv-static" />}
        </div>
      </div>
      <div className="tv-knob-row">
        {CHANNELS.map((ch, i) => (
          <button
            key={ch.name}
            onClick={() => changeChannel(i)}
            className={`tv-knob ${powered && i === channel ? 'tv-knob-on' : ''}`}
            title={ch.name}
          >
            {i + 1}
          </button>
        ))}
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
