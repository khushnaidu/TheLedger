import { STATUS_CONFIG } from '../constants';

export default function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status];

  if (config.stamp) {
    return (
      <span className={`stamp ${status === 'DONE' ? 'stamp-black' : 'stamp-red'}`}>
        {config.label}
      </span>
    );
  }

  return (
    <span className="text-[0.5625rem] uppercase tracking-[0.12em]" style={{ color: config.color }}>
      {config.label}
    </span>
  );
}
