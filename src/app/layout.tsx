import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CaseInbox — Gmail Evidence Analyzer",
  description:
    "Connect your inbox, ask in plain language, and walk away with an organized, preserved set of the emails that matter. Not legal advice.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
