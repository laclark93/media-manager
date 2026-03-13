import { useState, useEffect } from 'react';
import { timeAgo } from '../../utils/timeago';

interface LastUpdatedProps {
  timestamp: number | null;
}

export function LastUpdated({ timestamp }: LastUpdatedProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!timestamp) return;
    const timer = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(timer);
  }, [timestamp]);

  if (!timestamp) return null;

  return (
    <span className="last-updated" title={new Date(timestamp).toLocaleString()}>
      {timeAgo(timestamp)}
    </span>
  );
}
