import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
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
  title: "Fail2BanEntreprise",
  description: "Distributed Ban Intelligence for VoIP & High-Exposure Infrastructure",
};

// The layout reads the nonce that proxy.ts forwarded via the x-nonce request
// header. Applying it to <html nonce={...}> causes Next.js to automatically
// stamp the same nonce on its own inline hydration scripts, satisfying the
// strict CSP "script-src 'nonce-...'" directive without needing unsafe-inline.
// Ref: https://nextjs.org/docs/app/guides/content-security-policy

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      nonce={nonce}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        {children}
      </body>
    </html>
  );
}
