import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { DESKTOP_SIDEBAR_PREPAINT_SCRIPT } from "@/components/app-shell/desktop-sidebar-state";
import { AppToaster } from "@/components/ui/app-toaster";
import "./globals.css";

const geistSans = Geist({
  display: "swap",
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  display: "swap",
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "DEMI",
    template: "%s | DEMI",
  },
  description: "ระบบบริการสุขภาพ DEMI",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="th"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the stored sidebar width before paint so the shell skeleton and sidebar never jump. */}
        <script dangerouslySetInnerHTML={{ __html: DESKTOP_SIDEBAR_PREPAINT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
