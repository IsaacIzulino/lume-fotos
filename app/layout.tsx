import type { Metadata } from "next";import "./globals.css";
export const metadata:Metadata={title:"Lume — Memórias para guardar",description:"Uma forma especial de escolher e receber suas fotografias."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}
