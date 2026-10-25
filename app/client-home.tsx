import Brand,{BrandSparkle} from './brand';
import { Images } from 'lucide-react';

export default function ClientHome() {
  return (
    <div className="client-home">
      <header className="topbar">
        <Brand/>
      </header>
      <main className="client-home-main">
        <div className="client-home-icon"><Images size={30}/></div>
        <span className="eyebrow">ÁREA DO CLIENTE</span>
        <h1>Suas memórias, em um só lugar.</h1>
        <p>Abra o link do álbum enviado pelo seu fotógrafo para visualizar, escolher e baixar suas fotos.</p>
      </main>
      <footer className="page-footer"><span>LUME © 2026</span><span>Feito com cuidado <span className="terracotta"><BrandSparkle/></span></span></footer>
    </div>
  );
}
