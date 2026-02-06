import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://md-to-pdf.blazorserver.com"),
  title: {
    default: "MD → PDF | Online Markdown to PDF Converter",
    template: "%s | MD → PDF",
  },
  description:
    "Free online Markdown to PDF converter. Edit, preview, and export Markdown documents to PDF instantly. No registration required. Clean interface with live preview and syntax highlighting.",
  keywords: [
    "markdown to pdf",
    "markdown converter",
    "md to pdf",
    "markdown editor",
    "pdf generator",
    "markdown preview",
    "online markdown editor",
    "free markdown converter",
    "markdown export",
    "document converter",
  ],
  authors: [{ name: "MD → PDF" }],
  creator: "MD → PDF",
  publisher: "MD → PDF",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://md-to-pdf.blazorserver.com",
    title: "MD → PDF | Online Markdown to PDF Converter",
    description:
      "Free online Markdown to PDF converter. Edit, preview, and export Markdown documents to PDF instantly. No registration required.",
    siteName: "MD → PDF",
    images: [
      {
        url: "/icon.svg",
        width: 64,
        height: 64,
        alt: "MD → PDF Logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "MD → PDF | Online Markdown to PDF Converter",
    description:
      "Free online Markdown to PDF converter. Edit, preview, and export Markdown documents to PDF instantly.",
    images: ["/icon.svg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} min-h-dvh bg-background font-sans antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
