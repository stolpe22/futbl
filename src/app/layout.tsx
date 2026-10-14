import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Futebol da Missão", template: "%s · Futebol da Missão" },
  description: "Agenda, campos e votações do futebol da galera do MBL / Missão em Goiânia.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f0" },
    { media: "(prefers-color-scheme: dark)", color: "#070604" },
  ],
};

// Aplica o tema salvo antes de pintar a tela (evita piscar)
const themeScript = `try{var t=localStorage.getItem("tema");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${bricolage.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh bg-bg text-ink">
        {children}
        {/* embaixo: não cobre o menu do topo; no celular, acima da barra de navegação */}
        <Toaster
          position="bottom-right"
          mobileOffset={{ bottom: "calc(76px + env(safe-area-inset-bottom))", left: 12, right: 12 }}
          duration={3000}
          richColors
          closeButton
          toastOptions={{ style: { fontFamily: "inherit" } }}
        />
      </body>
    </html>
  );
}
