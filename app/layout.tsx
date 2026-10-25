import type { Metadata, Viewport } from "next";import "./globals.css";import "./mobile.css";
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',interactiveWidget:'resizes-content'};
export const metadata:Metadata={title:"Lume — Memórias para guardar",description:"Uma forma especial de escolher e receber suas fotografias."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}
