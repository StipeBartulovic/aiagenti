import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

export const metadata: Metadata = {
  title: "AI Validator — Validiraj svoju ideju za 30 sekundi",
  description:
    "Simuliraj reakcije 50 raznolikih kupaca na tvoju ideju. Kupovna namjera, ciljna skupina, razlozi odbijanja i akcijski plan.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="hr" className="h-full">
      <body className="min-h-full">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
