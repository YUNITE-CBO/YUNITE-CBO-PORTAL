'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="glass-strong w-full p-8">
        <div className="mb-3 text-4xl">🛰️</div>
        <h1 className="text-xl font-bold text-white">Something went wrong</h1>
        <p className="mt-2 text-sm text-white/60">
          An unexpected error occurred while loading this page. Please try again.
        </p>
        <button onClick={reset} className="btn-primary mt-5 w-full">Try again</button>
        <a href="/" className="btn-ghost mt-3 w-full">Back to home</a>
      </div>
    </main>
  );
}
