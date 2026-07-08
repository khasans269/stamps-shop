import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CartProvider } from "@/context/CartContext";
import { UndoToast } from "@/components/cart/UndoToast";
import { YandexMetrika } from "@/components/analytics/YandexMetrika";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  // metadataBase — базовый адрес, от которого Next.js строит абсолютные
  // ссылки для Open Graph и canonical. Без него превью в мессенджерах и
  // соцсетях могут ломаться на относительных путях.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Штампы для керамики — мастерская Аскара",
    template: "%s | Штампы для керамики",
  },
  description:
    "Алфавиты, штампы с узорами, текстурные ролики и инструменты для керамистов. Прямые продажи от мастера.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
          <CartProvider>
            <Header />
            <div className="flex-1">{children}</div>
            <Footer />
            <UndoToast />
          </CartProvider>
          <YandexMetrika />
        </body>
    </html>
  );
}
