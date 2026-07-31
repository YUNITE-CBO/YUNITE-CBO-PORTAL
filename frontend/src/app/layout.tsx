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
      <body className={`${inter.className} antialiased bg-neutral-50 dark:bg-neutral-950`}>
        <Providers>
          <div className="min-h-screen">
            <Sidebar />
            <div className="transition-all duration-300 lg:pl-[260px]">
              <TopBar />
              <main className="px-4 py-4 sm:px-5 lg:px-7 lg:py-7 xl:px-9">
                <div className="mx-auto max-w-[1400px]">{children}</div>
              </main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}