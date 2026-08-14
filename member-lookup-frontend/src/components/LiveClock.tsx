'use client';

import { useEffect, useState } from 'react';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function fmt(d: Date) {
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  return { time: `${hh}:${mm}:${ss}`, day: DAYS[d.getDay()], date: `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` };
}

export default function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // SSR / first paint uses a stable placeholder to avoid hydration mismatch,
  // then updates to the live clock on mount.
  const t = now ? fmt(now) : { time: '--:--:--', day: '—', date: '—' };

  return (
    <div className="text-right tabular">
      <div className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{t.time}</div>
      <div className="text-sm text-brand-green-soft">{t.day}</div>
      <div className="text-xs text-white/60">{t.date}</div>
    </div>
  );
}
