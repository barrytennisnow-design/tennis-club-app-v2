import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "Club Tennis",
  description: "Player signup, availability, and match-making",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-semibold text-court-green">
              🎾 Club Tennis
            </Link>
            <nav className="flex gap-4 text-sm text-stone-600">
              <Link href="/availability">Availability</Link>
              <Link href="/matches">My Matches</Link>
              <Link href="/profile">Profile</Link>
              <Link href="/admin">Manager</Link>
              <Link href="/login">Log in</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
