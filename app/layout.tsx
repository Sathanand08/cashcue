import { Fraunces, IBM_Plex_Sans, Noto_Sans_Telugu, Source_Sans_3 } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const sans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const numeric = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-numeric",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const telugu = Noto_Sans_Telugu({
  subsets: ["telugu"],
  variable: "--font-telugu",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata = {
  title: "CashCue",
  description: "Cash-flow control for solo freelancers and small studios",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${numeric.variable} ${telugu.variable}`}
    >
      <body className="font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
