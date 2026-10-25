export function BrandSparkle({className=''}:{className?:string}) {
  return <svg className={'brand-sparkle '+className} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M16 2v28M2 16h28M6.1 6.1l19.8 19.8M6.1 25.9 25.9 6.1"/></svg>;
}
export default function Brand({href='/fotografo'}:{href?:string}) {
  return <a className="brand" href={href} aria-label="Lume"><span className="brand-mark">l<BrandSparkle/></span><span>lume<span className="brand-sub">GALERIAS DE FOTOGRAFIA</span></span></a>;
}
