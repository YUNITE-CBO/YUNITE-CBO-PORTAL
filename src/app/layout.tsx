import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'YUNITE Enterprise Operating System',
  description: 'Enterprise-grade platform for Community-Based Organizations',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
