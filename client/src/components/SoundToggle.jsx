import { Volume2, VolumeX } from 'lucide-react';

export default function SoundToggle({ playing, onToggle }) {
  return (
    <button onClick={onToggle}
      className="fixed bottom-6 right-8 z-50 btn-ghost gap-2"
      title={playing ? 'Mute' : 'Play soundtrack'}>
      {playing
        ? <Volume2 className="w-3.5 h-3.5" />
        : <VolumeX className="w-3.5 h-3.5" />
      }
      <span className="text-[0.5rem] tracking-[0.1em]">{playing ? 'On' : 'Off'}</span>
    </button>
  );
}
