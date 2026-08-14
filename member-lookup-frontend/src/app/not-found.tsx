import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="glass-strong w-full p-8">
        <div className="mb-3 text-4xl">🔍</div>
        <h1 className="text-xl font-bold text-white">Page not found</h1>
        <p className="mt-2 text-sm text-white/60">The page you were looking for does not exist.</p>
        <Link href="/" className="btn-primary mt-5 w-full">Back to home</Link>
      </div>
    </main>
  );
}
