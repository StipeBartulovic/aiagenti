import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

export const metadata: Metadata = {
  title: "AI Validator — Validiraj svoju ideju za 30 sekundi",
  description:
    "Simuliraj reakcije 50 raznolikih kupaca na tvoju ideju. Kupovna namjera, ciljna skupina, razlozi odbijanja i akcijski plan.",
  applicationName: "AI Validator",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AI Validator",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#050507",
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
