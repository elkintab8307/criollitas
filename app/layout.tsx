import type { Metadata } from "next";
import { Fredoka, Inter, JetBrains_Mono } from "next/font/google";
import { MonitorConectividad } from "@/components/offline/MonitorConectividad";
import { RegistradorServiceWorker } from "@/components/offline/RegistradorServiceWorker";
import "./globals.css";

const fredoka = Fredoka({ subsets: ["latin"], variable: "--font-fredoka" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "Criollitas OS",
  description: "POS de comandas y caja — Criollitas, Arepas Rellenas",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO">
      <body className={`${fredoka.variable} ${inter.variable} ${jetbrains.variable} antialiased`}>
        <MonitorConectividad />
        <RegistradorServiceWorker />
        {children}
      </body>
    </html>
  );
}
