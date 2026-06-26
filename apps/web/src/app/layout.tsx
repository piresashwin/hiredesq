import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Hiredesq — your recruiting desk, finally in one place",
  description:
    "Forward your WhatsApp chats and messy resumes — get an instant clean candidate database and see your revenue.",
};

// Paint the right palette before React hydrates (no theme flash). Reads the
// cached preference (a mirror of the account theme) and resolves "system" against
// the OS; the ThemeProvider takes over once hydrated.
const NO_FLASH_THEME = `(function(){try{var t=localStorage.getItem('hiredesq.theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
