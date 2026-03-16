import type { Metadata } from "next";
import "./globals.css";
import ErrorBoundary from "@/components/ErrorBoundary";
import ClientProviders from "@/components/ClientProviders";

export const metadata: Metadata = {
  title: "RankMaster Pro — SEO/AEO Automation Platform",
  description: "Advanced SEO, AEO & Content Automation for WordPress sites. AI-powered content creation, optimization, and auto-publishing.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body suppressHydrationWarning>
        <ClientProviders>
          <ErrorBoundary>{children}</ErrorBoundary>
        </ClientProviders>
      </body>
    </html>
  );
}
