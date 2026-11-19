import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Central de Performance",
  description: "Painel privado de automação, recuperação, métricas e testes de copys",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
