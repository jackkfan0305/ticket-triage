import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { RunStoreProvider } from "@/components/run-store";
import "./globals.css";

// one family, four weights; body sits at 300
const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Triage Workbench",
  description: "Evidence behind every ticket the Jev classifier decides.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        {/* the session's answers, shared by the floor and every ticket route */}
        <RunStoreProvider>{children}</RunStoreProvider>
      </body>
    </html>
  );
}
