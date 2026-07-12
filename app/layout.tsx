import "./globals.css";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import NavBar from "@/components/NavBar";

export const metadata = {
  title: "Club Tennis",
  description: "Player signup, availability, and match-making",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ImpersonationBanner />
        <NavBar />
        <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
