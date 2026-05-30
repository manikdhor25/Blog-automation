import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import ErrorBoundary from "@/components/ErrorBoundary";
import ClientProviders from "@/components/ClientProviders";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0f" },
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
  ],
};

export const metadata: Metadata = {
  title: {
    default: "RankMaster Pro — SEO/AEO Automation Platform",
    template: "%s | RankMaster Pro",
  },
  description:
    "Advanced SEO, AEO & Content Automation for WordPress sites. AI-powered content creation, optimization, and auto-publishing with 7+ AI providers.",
  openGraph: {
    title: "RankMaster Pro — SEO/AEO Automation Platform",
    description: "AI-powered content creation, SEO optimization, and auto-publishing for WordPress.",
    type: "website",
    siteName: "RankMaster Pro",
  },
  twitter: {
    card: "summary_large_image",
    title: "RankMaster Pro",
    description: "AI-powered SEO/AEO automation for WordPress sites.",
  },
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <a href="#main-content" className="skip-to-content">
          Skip to content
        </a>
        <ErrorBoundary>
          <ClientProviders>
            {children}
          </ClientProviders>
        </ErrorBoundary>
      </body>
    </html>
  );
}
