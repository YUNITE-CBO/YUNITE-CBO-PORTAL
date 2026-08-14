import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'YUNITE Pamoja CBO — Member Portal',
  description:
    'A secure, futuristic member verification and account portal for YUNITE Pamoja CBO. Verify your membership and view your savings, shares, contributions, loans, fines, and statements.',
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#0B2A4A',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased">
        <div className="aurora" aria-hidden />
        {children}
      </body>
    </html>
  );
}
