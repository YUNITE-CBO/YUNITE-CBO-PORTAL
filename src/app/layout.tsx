import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'YUNITE Enterprise Operating System',
  description: 'Enterprise-grade platform for Community-Based Organizations',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        {children}
      </body>
    </html>
  );
}
