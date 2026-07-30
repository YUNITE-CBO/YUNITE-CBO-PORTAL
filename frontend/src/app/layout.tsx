import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "YUNITE Banking System - Admin Portal",
  description: "Enterprise Banking Administration Portal for Community-Based Organizations",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className="scroll-smooth">
      <body className={`${inter.className} bg-neutral-50 dark:bg-neutral-950 antialiased`}>
        <Providers>
          <div className="min-h-screen">
            <Sidebar />
            <div className="lg:pl-[260px] transition-all duration-200">
              <TopBar />
              <main className="p-4 lg:p-6 xl:p-8">
                {children}
              </main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}