import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Betten Hub · Betten Imports",
  description: "The central workspace for Betten Imports apps, information and department conversations.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
