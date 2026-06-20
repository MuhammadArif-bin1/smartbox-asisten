import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smartbox Assistant",
  description: "Dashboard IoT untuk ESP32-S3, sensor, alarm, DFPlayer, dan MQTT.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="h-full antialiased" data-scroll-behavior="smooth">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
