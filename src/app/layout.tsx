import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bot Observability — AI Crawler & SEO Bot Analytics",
  description:
    "Track AI crawlers, search engines, SEO tools, and bot traffic across your websites with an open-source, self-hosted observability dashboard.",
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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="app-header">
          <div className="app-header-inner">
            <Link href="/" className="app-brand">
              <span aria-hidden="true" className="app-brand-mark"><i /><i /><i /></span>
              Bot Observability
            </Link>
            <nav className="flex items-center gap-1">
              <Link href="/dashboard" prefetch={false} className="app-header-link">
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
