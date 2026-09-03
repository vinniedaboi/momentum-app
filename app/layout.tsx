import type { Metadata } from "next";
import { Fraunces, Nunito_Sans } from "next/font/google";
import { headers } from "next/headers";
import { Analytics } from "@vercel/analytics/next";
import "./tokens.css";
import "./globals.css";
import "./features.css";
import "./friendly-theme.css";
import "./exams.css";
import "./grades.css";
import "./guide.css";
import "./auth.css";
import "./brand.css";
import "./landing.css";
import "./admin.css";

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
  // The request's own origin rather than a configured one, so a preview
  // deployment describes itself rather than pointing search engines and link
  // previews at production.
  const origin = `${protocol}://${host}`;
  const title = "Momentum — Know exactly what to review next";
  const description =
    "A revision planner for A Level, IGCSE and IB students. Momentum loads your official "
    + "syllabus, schedules every spec point, and tells you what to revise today. Free.";

  return {
    metadataBase: new URL(origin),
    title: { default: title, template: "%s · Momentum" },
    description,
    applicationName: "Momentum",
    keywords: [
      "revision planner", "A Level revision", "IGCSE revision", "IB Diploma revision",
      "syllabus tracker", "past paper tracker", "study schedule", "Cambridge International",
      "spaced review", "exam planner",
    ],
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      siteName: "Momentum",
      url: origin,
      title,
      description,
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "Momentum — know exactly what to review next" }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
    robots: { index: true, follow: true },
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
        {/*
          * Page views and Web Vitals, collected by Vercel rather than by a
          * third party: the script is served from this origin, so it needs no
          * consent banner and nothing leaves the deployment. It is inert
          * anywhere but a Vercel deployment, which keeps `next dev` quiet.
          */}
        <Analytics />
      </body>
    </html>
  );
}
