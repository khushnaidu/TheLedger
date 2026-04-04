import { useState, useRef, useEffect } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

export default function SoundToggle() {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const audio = new Audio('/audio/soundtrack.mp3');
    audio.loop = true;
    audio.volume = 0.3;
    audioRef.current = audio;
    return () => { audio.pause(); audio.src = ''; };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
    setPlaying(!playing);
  };

  return (
    <button onClick={toggle}
      className="fixed top-6 right-8 z-50 btn-ghost gap-2"
      title={playing ? 'Mute' : 'Play soundtrack'}>
      {playing
        ? <Volume2 className="w-3.5 h-3.5" />
        : <VolumeX className="w-3.5 h-3.5" />
      }
      <span className="text-[0.5rem] tracking-[0.1em]">{playing ? 'On' : 'Off'}</span>
    </button>
  );
}
