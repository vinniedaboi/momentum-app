import type { Metadata } from "next";
import { Fraunces, Nunito_Sans } from "next/font/google";
import { headers } from "next/headers";
import "./tokens.css";
import "./globals.css";
import "./features.css";
import "./friendly-theme.css";
import "./exams.css";
import "./guide.css";
import "./auth.css";
import "./brand.css";

const nunito = Nunito_Sans({
  variable: "--font-friendly-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-friendly-display",
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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          * Runs before the first paint, because a theme applied after it is a
          * flash of the wrong one. A saved choice wins; without one the app
          * follows the system, and `color-scheme` carries that to the form
          * controls and scrollbars the stylesheets do not reach.
          */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var saved=localStorage.getItem("momentum-theme");`
              + `var dark=saved?saved==="dark":matchMedia("(prefers-color-scheme: dark)").matches;`
              + `var root=document.documentElement;`
              + `root.dataset.theme=dark?"dark":"light";`
              + `root.style.colorScheme=dark?"dark":"light";}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className={`${nunito.variable} ${fraunces.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
