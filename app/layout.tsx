import type { Metadata } from "next";
import { Fraunces, Geist_Mono, Nunito_Sans } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import "./features.css";
import "./friendly-theme.css";
import "./exams.css";
import "./auth.css";

const nunito = Nunito_Sans({
  variable: "--font-friendly-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-friendly-display",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = incoming.get("host") ?? "localhost:3001";
  const protocol = host.includes("localhost") ? "http" : "https";
  const image = `${protocol}://${host}/og.png`;
  const title = "Momentum Study Tracker";
  const description = "Know exactly what to review next, with automatic study scheduling.";

  return {
    title,
    description,
    openGraph: { title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${nunito.variable} ${fraunces.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
