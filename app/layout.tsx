import "./globals.css";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import NavBar from "@/components/NavBar";

export const metadata = {
  title: "Club Tennis",
  description: "Player signup, availability, and match-making",
};

// Next.js's App Router does NOT add a viewport meta tag automatically
// -- without this, mobile browsers assume a ~980px desktop-width page
// and shrink everything to fit, which is what made text and buttons
// look cramped/run-together on phones regardless of any other fix.
export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ImpersonationBanner />
        <NavBar />
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
