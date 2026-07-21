import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bot Observability",
  description: "Crawler identity, bot traffic reporting, and event inspection for every project.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-neutral-800 px-5 py-3 sm:px-6">
          <div className="max-w-7xl mx-auto flex min-h-8 items-center justify-between">
            <Link href="/" className="text-sm font-semibold tracking-tight text-neutral-100 hover:text-white">
              Bot Observability
            </Link>
            <nav className="flex items-center gap-1">
              <Link href="/dashboard" className="text-sm font-medium text-neutral-400 hover:text-neutral-100">
                Dashboard
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">
          {children}
        </main>
      </body>
    </html>
  );
}
