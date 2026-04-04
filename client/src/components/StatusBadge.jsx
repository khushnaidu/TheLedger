import { STATUS_CONFIG } from '../constants';

export default function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status];

  if (status === 'DONE') {
    return <span className="stamp" style={{ color: '#2a7d4f', borderColor: '#2a7d4f' }}>{config.label}</span>;
  }

  if (config.stamp) {
    return <span className="stamp stamp-red">{config.label}</span>;
  }

  return (
    <span className="text-[0.5625rem] uppercase tracking-[0.12em]" style={{ color: config.color }}>
      {config.label}
    </span>
  );
}
