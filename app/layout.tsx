import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Noto_Sans_Devanagari, Noto_Sans_Kannada } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-display",
});

const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["500", "700"],
  variable: "--font-deva",
});

const kannada = Noto_Sans_Kannada({
  subsets: ["kannada"],
  weight: ["500", "700"],
  variable: "--font-knda",
});

export const metadata: Metadata = {
  title: "Auto Anna AI",
  description:
    "Speak Hindi. Anna hears Kannada. Anna speaks Kannada. You hear Hindi. Arguments, automated.",
  openGraph: {
    title: "Auto Anna AI",
    description: "Automating arguments with Bengaluru auto drivers.",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffc107",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${devanagari.variable} ${kannada.variable} h-full`}
    >
      <body className="min-h-dvh bg-[#0e0d0b] antialiased">{children}</body>
    </html>
  );
}
