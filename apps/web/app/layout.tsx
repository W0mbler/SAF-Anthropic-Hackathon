import type { Metadata } from "next";
import "./globals.css";
import AppShell from "../components/AppShell";
export const metadata: Metadata = {
  title: "SAF COMMAND · Kalimantan",
  description:
    "From biomass to boarding gates. Sustainable aviation fuel supply network planning.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
