import { PRIORITY_CONFIG } from '../constants';

export default function PriorityBadge({ priority }) {
  const config = PRIORITY_CONFIG[priority];

  if (priority === 'CRITICAL') {
    return <span className="stamp stamp-red">{config.label}</span>;
  }

  return (
    <span className="text-[0.5625rem] uppercase tracking-[0.12em]" style={{ color: config.color }}>
      {config.label}
    </span>
  );
}
