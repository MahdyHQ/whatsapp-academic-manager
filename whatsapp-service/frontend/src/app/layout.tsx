import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from '@/components/providers';
import { AuthProvider } from '@/contexts/auth-context';
import { Toaster } from '@/components/ui/toaster';
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
  title: "Academic Manager | WhatsApp System",
  description: "AI-powered WhatsApp Academic Management System with 8-tier color-coded priority - Platform Independent Edition",
  keywords: "whatsapp, academic, management, ai, platform-independent, railway, mahdyhq",
  authors: [{ name: "MahdyHQ" }],
  creator: "MahdyHQ",
  publisher: "MahdyHQ",
  openGraph: {
    title: "Academic Manager | WhatsApp System",
    description: "AI-powered WhatsApp Academic Management System",
    type: "website",
    locale: "en_US",
  },
  icons:{ icon: '/favicon.svg' }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          <Providers>
            {children}
          </Providers>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}