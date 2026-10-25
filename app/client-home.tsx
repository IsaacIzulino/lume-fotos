import { Images } from 'lucide-react';

export default function ClientHome() {
  return (
    <div className="client-home">
      <header className="topbar">
        <a className="brand" href="/cliente" aria-label="Lume — área do cliente">
          <span className="brand-mark">l<span>✳</span></span>
          <span>lume<span className="brand-sub">GALERIAS DE FOTOGRAFIA</span></span>
        </a>
      </header>
      <main className="client-home-main">
        <div className="client-home-icon"><Images size={30}/></div>
        <span className="eyebrow">ÁREA DO CLIENTE</span>
        <h1>Suas memórias, em um só lugar.</h1>
        <p>Abra o link do álbum enviado pelo seu fotógrafo para visualizar, escolher e baixar suas fotos.</p>
      </main>
      <footer className="page-footer"><span>LUME © 2026</span><span>Feito com cuidado <span className="terracotta">✳</span></span></footer>
    </div>
  );
}
