'use client';
import React,{useState,useEffect,useRef} from 'react';
import {ArrowDown,ArrowLeft,ArrowRight,Check,ChevronDown,Download,Expand,Grid2X2,Heart,ImagePlus,Images,Link2,Loader2,Lock,LogOut,Plus,Search,Send,Settings,ShieldCheck,Sparkles,Upload,X} from 'lucide-react';
import {demoPhotos} from './demo';
import {uploadPhoto} from './upload';
import Brand,{BrandSparkle} from './brand';
import {preparePhotoFiles,canShareImages,shareImages} from './download';
type Photo={id:string;name:string;size:number;mime?:string;url?:string;alt?:string};
type Album={id:string;token:string;title:string;client:string;date:string;published:number;count?:number;cover?:string;selectionCount?:number};
async function api(path:string,method='GET',body?:any){const r=await fetch('/api/'+path,{method,headers:body instanceof FormData?{}:body?{'Content-Type':'application/json'}:{},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});let b:any;try{b=await r.json()}catch{throw new Error('O servidor não respondeu. Tente novamente.')}if(!r.ok)throw Object.assign(new Error(b.error||'Não foi possível concluir.'),{status:r.status});if(b&&typeof b==='object'){b.maxUploadMB=Number(r.headers.get('x-lume-max-upload-mb')||25);b.uploadMode=r.headers.get('x-lume-upload-mode')||'legacy'};return b}
function Modal({children,close,label}:{children:React.ReactNode;close:()=>void;label:string}){const ref=useRef<HTMLDivElement>(null);useEffect(()=>{const before=document.activeElement as HTMLElement;const old=document.body.style.overflow;document.body.style.overflow='hidden';ref.current?.focus();function key(e:KeyboardEvent){if(e.key==='Escape')close();if(e.key==='Tab'){const els=ref.current?.querySelectorAll<HTMLElement>('button,a,input,select,[tabindex="0"]');if(!els?.length)return;const first=els[0],last=els[els.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}}document.addEventListener('keydown',key);return()=>{document.body.style.overflow=old;document.removeEventListener('keydown',key);before?.focus()}},[]);return <div className="scrim" onClick={e=>{if(e.target===e.currentTarget)close()}}><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} className="modal"><button className="icon close" onClick={close} aria-label="Fechar"><X/></button>{children}</div></div>}
export default function Studio({mode,token='demo'}:{mode:'gallery'|'admin';token?:string}){
const [maxUploadMB,setMaxUploadMB]=useState(25),[uploadMode,setUploadMode]=useState('legacy'),[clientReady,setClientReady]=useState(false);
const [user,setUser]=useState<boolean|null>(null),[albums,setAlbums]=useState<Album[]>([]),[album,setAlbum]=useState<Album|null>(null),[photos,setPhotos]=useState<Photo[]>([]),[selections,setSelections]=useState<any[]>([]);
const [error,setError]=useState(''),[toast,setToast]=useState(''),[busy,setBusy]=useState(''),[query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[selected,setSelected]=useState<Set<string>>(new Set()),[light,setLight]=useState<number|null>(null),[dialog,setDialog]=useState(''),[progress,setProgress]=useState(''),[loaded,setLoaded]=useState(false);
const [preparedImages,setPreparedImages]=useState<File[]>([]),[preparedSources,setPreparedSources]=useState<string[]>([]),[saveError,setSaveError]=useState(''),[nativeSaving,setNativeSaving]=useState(false),[shareUnavailable,setShareUnavailable]=useState(false);
const [barHidden,setBarHidden]=useState(false);
const [preparedPhotos,setPreparedPhotos]=useState<Photo[]>([]);
const [zipFile,setZipFile]=useState<{url:string;name:string;scope:'all'|'selected'}|null>(null);
useEffect(()=>()=>{if(zipFile)URL.revokeObjectURL(zipFile.url)},[zipFile]);
const saveAbort=useRef<AbortController|null>(null),saveVersion=useRef(0);

const input=useRef<HTMLInputElement>(null),downloadBar=useRef<HTMLDivElement>(null),touchStart=useRef<{x:number;y:number}|null>(null),isAdmin=mode==='admin';
useEffect(()=>{if(isAdmin||!downloadBar.current)return;const element=downloadBar.current;const update=()=>document.documentElement.style.setProperty('--download-bar-height',element.getBoundingClientRect().height+'px');update();const observer=new ResizeObserver(update);observer.observe(element);return()=>{observer.disconnect();document.documentElement.style.removeProperty('--download-bar-height')}},[isAdmin,loaded,album?.id]);
// Keep the mobile actions within reach without covering photos while browsing.
useEffect(()=>{
 setBarHidden(false);
 if(isAdmin||!loaded||!album||dialog||light!==null||busy)return;
 const mobile=window.matchMedia('(max-width: 760px), (pointer: coarse)');
 const position=()=>Math.max(0,Math.min(window.scrollY,document.documentElement.scrollHeight-window.innerHeight));
 let previous=position(),travel=0,direction=0,frame=0,width=window.innerWidth;
 const update=()=>{
  frame=0;
  const current=position(),delta=current-previous;previous=current;
  if(!mobile.matches||current<=24){travel=0;setBarHidden(false);return}
  if(!delta)return;
  const nextDirection=Math.sign(delta);
  travel=nextDirection===direction?travel+Math.abs(delta):Math.abs(delta);direction=nextDirection;
  if(travel<10)return;
  if(downloadBar.current?.contains(document.activeElement))return;
  setBarHidden(direction>0);travel=0;
 };
 const scroll=()=>{if(!frame)frame=window.requestAnimationFrame(update)};
 const reset=()=>{previous=position();travel=0;direction=0;setBarHidden(false)};
 // Safari changes viewport height as its address bar moves; only width changes reset scrolling.
 const resize=()=>{if(window.innerWidth!==width){width=window.innerWidth;reset()}};
 const keyboard=(event:KeyboardEvent)=>{if(event.key==='Tab')reset()};
 window.addEventListener('scroll',scroll,{passive:true});
 window.addEventListener('resize',resize);
 window.addEventListener('keydown',keyboard);
 mobile.addEventListener('change',reset);
 return()=>{window.removeEventListener('scroll',scroll);window.removeEventListener('resize',resize);window.removeEventListener('keydown',keyboard);mobile.removeEventListener('change',reset);window.cancelAnimationFrame(frame)};
},[isAdmin,loaded,album?.id,dialog,light,busy]);
async function loadAlbums(){setAlbums(await api('albums'))}
async function openAlbum(id:string,resetScroll=false){setError('');try{const d=await api('albums/'+id);setAlbum(d.album);setPhotos(d.photos);setSelections(d.selections);setFilter('all');setSelected(new Set());if(resetScroll)window.scrollTo({top:0,behavior:'auto'});return d}catch(e:any){setError(e.message);return null}}
useEffect(()=>{if(isAdmin){api('me').then(d=>{setMaxUploadMB(d.maxUploadMB);setUploadMode(d.uploadMode);setUser(true);return loadAlbums()}).catch(e=>{setUser(false);if(e.status!==401)setError(e.message)}).finally(()=>setLoaded(true))}else{api('gallery/'+token).then(d=>{setAlbum(d.album);setPhotos(d.photos)}).catch(e=>setError(e.message)).finally(()=>setLoaded(true))}},[]);
useEffect(()=>{if(isAdmin){setClientReady(true);return}if(!loaded)return;try{const ids=JSON.parse(localStorage.getItem('lume:'+token)||'[]');setSelected(new Set(ids.filter((id:string)=>photos.some(p=>p.id===id))))}catch{}finally{setClientReady(true)}},[isAdmin,loaded,photos.length]);
useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),4500);return()=>clearTimeout(t)},[toast]);
function toggle(id:string){setSelected(prev=>{const s=new Set(prev);s.has(id)?s.delete(id):s.add(id);try{localStorage.setItem('lume:'+token,JSON.stringify([...s]))}catch{}return s})}
function img(p:Photo,download=false){return p.url&&!download?p.url:'/api/image/'+(isAdmin?album?.id:token)+'/'+p.id+(isAdmin?'?admin=1':'')+(download?(isAdmin?'&':'?')+'download=1':'')}
function photoLabel(photo:Photo){return 'Foto '+String(photos.findIndex(item=>item.id===photo.id)+1).padStart(2,'0')}
function closeSaveImages(){
 saveVersion.current++;saveAbort.current?.abort();saveAbort.current=null;
 setDialog('');setPreparedPhotos([]);setPreparedImages([]);setPreparedSources([]);setSaveError('');setBusy('');setNativeSaving(false);
}
async function prepareForGallery(list:Photo[]){
 if(!list.length||busy)return;
 const version=++saveVersion.current,controller=new AbortController();
 saveAbort.current?.abort();saveAbort.current=controller;
 setLight(null);setPreparedPhotos(list);setPreparedImages([]);setPreparedSources(list.map(photo=>img(photo)));setSaveError('');setShareUnavailable(false);setDialog('save-images');setBusy('download');setProgress('Preparando suas fotos...');
 try{
  const files=await preparePhotoFiles(list,photo=>fetch(img(photo as Photo,true),{signal:controller.signal,cache:'no-store'}),(current,total)=>{if(saveVersion.current===version)setProgress('Preparando foto '+current+' de '+total)},controller.signal);
  if(saveVersion.current===version)setPreparedImages(files);
 }catch(error:any){
  if(saveVersion.current===version&&error.name!=='AbortError')setSaveError(error.message||'Não foi possível preparar as fotos.');
 }finally{if(saveVersion.current===version){setBusy('');saveAbort.current=null}}
}
function downloadSelected(){
 if(window.matchMedia('(max-width: 760px), (pointer: coarse)').matches)void prepareForGallery(photos.filter(photo=>selected.has(photo.id)));
 else void downloadZip();
}
function downloadSingle(photo:Photo){
 if(window.matchMedia('(max-width: 760px), (pointer: coarse)').matches){void prepareForGallery([photo]);return}
 const link=document.createElement('a');link.href=img(photo,true);link.download='foto';link.click();
}
async function savePreparedImages(){
 if(nativeSaving||!preparedImages.length)return;
 setNativeSaving(true);setSaveError('');
 try{await shareImages(preparedImages)}
 catch(error:any){if(error.name!=='AbortError'){setShareUnavailable(true);setSaveError('Use a imagem abaixo: toque e segure para ver a opção de salvar no seu aparelho.')}}
 finally{setNativeSaving(false)}
}

const visible=photos.filter(p=>(filter!=='selected'||selected.has(p.id))&&p.name.toLowerCase().includes(query.toLowerCase()));
async function upload(files:FileList|File[]){
 const batch=Array.from(files);
 if(!album||busy)return;
 if(!batch.length){setError('Escolha pelo menos uma foto para enviar.');return}
 const albumId=album.id;
 setBusy('upload');setError('');
 const results:{name:string;id?:string;error?:string}[]=[];
 try{
  for(let index=0;index<batch.length;index++){
   const file=batch[index];
   setProgress('Enviando '+(index+1)+' de '+batch.length+' · '+file.name);
   try{
    if(file.size>maxUploadMB*1024*1024)throw new Error('limite de '+maxUploadMB+' MB');
    const saved=await uploadPhoto(file,albumId,uploadMode,api);
    results.push({name:file.name,id:saved.id});
   }catch(error:any){results.push({name:file.name,id:error.uploadId,error:error.message})}
  }
  setProgress('Conferindo as fotos no álbum...');
  const refreshed=await openAlbum(albumId);
  await loadAlbums();
  if(!refreshed){setError('Não foi possível conferir o envio. Abra o álbum novamente antes de reenviar as fotos.');return}
  const confirmed=new Set(refreshed.photos.map((photo:Photo)=>photo.id));
  const received=results.filter(result=>result.id&&confirmed.has(result.id));
  const failed=results.filter(result=>!result.id||!confirmed.has(result.id));
  if(received.length)setToast(received.length===1?'1 foto enviada e disponível no álbum.':received.length+' fotos enviadas e disponíveis no álbum.');
  if(failed.length)setError(failed.map(result=>result.name+': '+(result.error||'envio ainda não confirmado. Abra o álbum novamente para conferir.')).join(' | '));
 }catch(error:any){setError(error.message||'Não foi possível concluir o envio.')}
 finally{setBusy('');setProgress('')}
}
async function publish(){if(!album)return;setBusy('publish');try{await api('albums/'+album.id,'PATCH',{published:!album.published});await openAlbum(album.id);await loadAlbums();setToast(album.published?'Galeria desativada.':'Galeria disponível para o cliente.')}catch(e:any){setError(e.message)}finally{setBusy('')}}
async function copyLink(){if(!album?.published){setToast('Ative a galeria antes de compartilhar.');return}const url=location.origin+'/cliente/'+album.token;if(navigator.share&&window.matchMedia('(max-width: 760px)').matches){try{await navigator.share({title:album.title,url});return}catch(error){if(error instanceof Error&&error.name==='AbortError')return}}try{await navigator.clipboard.writeText(url);setToast('Link do cliente copiado!')}catch{setDialog('link')}}
async function downloadZip(scope:'all'|'selected'='selected',chosenPhotos?:Photo[]){
 const list=chosenPhotos??(scope==='all'?photos:photos.filter(p=>selected.has(p.id)));
 const showError=(message:string)=>dialog==='save-images'?setSaveError(message):setError(message);
 if(!list.length||busy)return;
 if(list.reduce((n,p)=>n+p.size,0)>200*1024*1024){showError('O limite por ZIP é de 200 MB. Selecione menos fotos ou baixe as imagens individualmente.');return}
 setBusy('zip');setError('');setSaveError('');setZipFile(null);
 try{
  const files=[];let total=0;
  for(let i=0;i<list.length;i++){
   setProgress('Preparando foto '+(i+1)+' de '+list.length);
   const response=await fetch(img(list[i],true));
   if(!response.ok)throw new Error('Não foi possível baixar a foto '+(i+1)+'. Tente novamente.');
   const data=new Uint8Array(await response.arrayBuffer());total+=data.length;
   if(total>200*1024*1024)throw new Error('O limite por ZIP é de 200 MB. Selecione menos fotos ou baixe as imagens individualmente.');
   files.push({name:String(i+1).padStart(3,'0')+'_'+list[i].name,data});
  }
  const {zip}=await import('./zip');
  const file={scope,url:URL.createObjectURL(zip(files)),name:(album?.title||'minhas-fotos').replace(/[^a-zA-Z0-9À-ÿ -]/g,'')+'.zip'};
  setZipFile(file);setDialog('zip-ready');
 }catch(e:any){showError(e.message)}finally{setBusy('');setProgress('')}
}
useEffect(()=>{if(light===null)return;const key=(e:KeyboardEvent)=>{if(e.key==='ArrowRight')setLight(x=>x===null?null:(x+1)%photos.length);if(e.key==='ArrowLeft')setLight(x=>x===null?null:(x-1+photos.length)%photos.length)};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key)},[light,photos.length]);
const date=album?.date?new Date(album.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'}):'';
const alert=error&&<div className="alert" role="alert">{error}<button className="icon" aria-label="Fechar aviso" onClick={()=>setError('')}><X size={16}/></button></div>;
const notify=toast&&<div className="toast" role="status"><Check size={18}/>{toast}</div>;
if(isAdmin&&user!==true)return <div className="login-shell"><div className="login-photo"><img src={demoPhotos[0].url} alt="Uma celebração repleta de memórias"/><div><span className="eyebrow">FEITO PARA QUEM ETERNIZA MOMENTOS</span><h1>Seu olhar.<br/>As memórias deles.</h1><p>Uma entrega tão especial quanto cada fotografia.</p></div></div><main className="login-main"><Brand href={isAdmin?'/fotografo':'/cliente/'+token}/><div className="login-form"><span className="eyebrow">ÁREA DO FOTÓGRAFO</span><h2>Bom ter você por aqui.</h2><p>Entre para cuidar das suas galerias.</p>{alert}<form onSubmit={async e=>{e.preventDefault();setError('');setBusy('login');const f=new FormData(e.currentTarget);try{const login=await api('login','POST',Object.fromEntries(f));setMaxUploadMB(login.maxUploadMB);setUploadMode(login.uploadMode);setUser(true);await loadAlbums()}catch(e:any){setError(e.message)}finally{setBusy('')}}}><label>Usuário<input name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="Seu usuário" required/></label><label>Senha<input type="password" name="password" autoComplete="current-password" placeholder="Sua senha" required/></label><button className="btn primary full" disabled={!!busy||!loaded}>{busy?<Loader2 className="spin" size={18}/>:<Lock size={17}/>} Entrar no estúdio</button></form><small><ShieldCheck size={14}/> Acesso protegido para o fotógrafo</small></div><footer>LUME © 2026 · CADA MEMÓRIA MERECE UM LUGAR.</footer></main>{notify}</div>;
if(!loaded)return <main className="loading"><Brand href={isAdmin?'/fotografo':'/cliente/'+token}/><Loader2 className="spin"/><p>Preparando suas memórias...</p></main>;
if(!isAdmin&&!album)return <main className="loading"><Brand href={isAdmin?'/fotografo':'/cliente/'+token}/><h1>Galeria indisponível</h1>{alert}<p>Confira se você está usando o link do álbum enviado pelo seu fotógrafo.</p></main>;
return <div className={isAdmin?'app admin-app':'app'}>
<header className="topbar"><Brand href={isAdmin?'/fotografo':'/cliente/'+token}/>{isAdmin?<div className="top-actions"><span className="subtle">Seu estúdio, em um só lugar.</span><span className="avatar">F</span><button className="icon" title="Sair" onClick={async()=>{try{await api('logout','POST');setUser(false);setAlbum(null)}catch(e:any){setError(e.message)}}}><LogOut size={19}/></button></div>:<div className="top-actions"><span className="delivery"><span/> GALERIA DO CLIENTE</span></div>}</header>
{isAdmin&&<aside className="sidebar"><span className="eyebrow">MEU ESTÚDIO</span><button className="nav-item active" onClick={()=>{setAlbum(null);setQuery('');setError('');window.scrollTo({top:0,behavior:'auto'})}}><Images size={19}/> Minhas galerias <span>{albums.length}</span></button><div className="sidebar-note"><Sparkles size={22}/><h3>Menos etapas.<br/>Mais memórias.</h3><p>Crie uma galeria, envie suas fotos e compartilhe o link.</p></div><div className="sidebar-bottom"><ShieldCheck size={16}/> Estúdio protegido</div></aside>}
<main className={isAdmin?'admin-main':'gallery-main'}>
{alert}
{isAdmin&&!album?<><div className="page-heading"><div><span className="eyebrow">SEU ESPAÇO CRIATIVO</span><h1>Minhas galerias<span className="dot">.</span></h1><p>Cada história, um lugar especial.</p></div><button className="btn primary" onClick={()=>setDialog('create')}><Plus size={18}/> Nova galeria</button></div><div className="stats"><div><span>Galerias criadas</span><strong>{albums.length.toString().padStart(2,'0')}</strong><Images/></div><div><span>Fotografias enviadas</span><strong>{albums.reduce((s,a)=>s+(a.count||0),0).toString().padStart(2,'0')}</strong><ImagePlus/></div><div><span>Seleções recebidas</span><strong>{albums.reduce((s,a)=>s+(a.selectionCount||0),0).toString().padStart(2,'0')}</strong><Heart/></div></div><div className="toolbar"><div className="tabs"><button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>Todas as galerias</button><button className={filter==='published'?'active':''} onClick={()=>setFilter('published')}>Compartilhadas</button><button className={filter==='draft'?'active':''} onClick={()=>setFilter('draft')}>Rascunhos</button></div><div className="search"><Search size={17}/><input aria-label="Buscar galeria" placeholder="Buscar galeria..." value={query} onChange={e=>setQuery(e.target.value)}/></div></div><div className="album-grid">{albums.filter(a=>(filter==='all'||(filter==='published'?a.published:!a.published))&&(a.title+' '+a.client).toLowerCase().includes(query.toLowerCase())).map(a=><button className="album-card" key={a.id} onClick={()=>openAlbum(a.id,true)}><div className="album-cover">{a.cover?<img src={'/api/image/'+a.id+'/'+a.cover+'?admin=1'} alt={a.title}/>:<Images size={40}/>}<span className={'status '+(a.published?'live':'')}>{a.published?'Compartilhada':'Rascunho'}</span></div><div className="album-info"><span className="eyebrow">{a.client||'GALERIA'}</span><h2>{a.title}</h2><div><span>{a.count} fotos · {a.selectionCount} seleções</span><ArrowRight size={20}/></div></div></button>)}<button className="new-card" onClick={()=>setDialog('create')}><span><Plus/></span><strong>Uma nova história</strong><p>Crie uma galeria para seu próximo ensaio</p></button></div>{!albums.length&&<div className="hint"><Sparkles size={18}/> Seu primeiro álbum começa aqui. Crie uma galeria e envie suas fotos.</div>}</>:
<>
{isAdmin?<><button className="back-link" onClick={()=>{setAlbum(null);setQuery('');setFilter('all');window.scrollTo({top:0,behavior:'auto'})}}><ArrowLeft size={16}/> Todas as galerias</button><div className="page-heading"><div><span className="eyebrow">GALERIA · {album?.client}</span><h1>{album?.title}</h1><p>{date} · {photos.length} fotografias</p></div><div className="top-actions"><button className="btn" disabled={!!busy} onClick={publish}>{album?.published?'Desativar galeria':'Ativar galeria'}</button><button className="btn primary" disabled={!album?.published} onClick={copyLink}><Link2 size={17}/><span className="desktop-label">Copiar link</span><span className="mobile-label">Compartilhar link</span></button></div></div><div className="upload-zone" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();upload(e.dataTransfer.files)}}><Upload size={28}/><div><strong>{busy==='upload'?progress:<><span className="desktop-label">Solte suas fotografias aqui</span><span className="mobile-label">Envie as fotos do seu celular</span></>}</strong><p>JPG, PNG ou WebP · até {maxUploadMB} MB por foto · arquivos originais</p></div><button className="btn" disabled={!!busy} onClick={()=>input.current?.click()}><Plus size={17}/> Escolher fotos</button><input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp" hidden onChange={e=>{const files=Array.from(e.currentTarget.files||[]);e.currentTarget.value='';if(files.length)void upload(files)}}/></div>{selections.length>0&&<details className="selection-list"><summary><Heart size={17}/> {selections.length} seleções recebidas <ChevronDown size={16}/></summary>{selections.map(s=><div key={s.id}><strong>{s.name}</strong><small>{new Date(s.created).toLocaleString('pt-BR')}</small><p>{JSON.parse(s.photos).map((id:string)=>photos.find(p=>p.id===id)?.name||'Foto removida').join(' · ')}</p></div>)}</details>}</>:
<section className="gallery-hero"><div className="hero-copy"><span className="eyebrow"><span className="tiny-line"/> UMA HISTÓRIA PARA REVISITAR</span><h1>{album?.title}</h1><p className="hero-date">{date}</p><p className="hero-description">Os instantes passam.<br/>As memórias ficam para sempre.</p><div className="hero-meta"><span className="avatar"><Images size={18}/></span><div><strong>Sua galeria de memórias</strong><small>{photos.length} fotografias · escolha as suas favoritas</small></div></div><a className="mobile-gallery-jump" href="#fotografias">Ver fotografias <ArrowDown size={17}/></a></div><div className="hero-image">{photos[0]?<img src={img(photos[0])} alt={photos[0].alt||album?.title}/>:<Images size={64}/>}<span className="hero-caption">UM INSTANTE. INFINITAS LEMBRANÇAS.</span><span className="hero-index">01 / {String(photos.length).padStart(2,'0')}</span></div></section>}
<div className="collection-heading" id="fotografias"><div><span className="eyebrow">{isAdmin?'FOTOGRAFIAS DO ÁLBUM':'ESCOLHA COM O CORAÇÃO'}</span><h2>{isAdmin?'Fotografias':'Seus melhores momentos'}<span className="count">{photos.length}</span></h2></div>{!isAdmin&&<p><Heart size={16}/> Toque no coração para selecionar</p>}</div>
<div className="toolbar"><div className="tabs"><button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>Todas as fotos <span>{photos.length}</span></button>{!isAdmin&&<button className={filter==='selected'?'active':''} onClick={()=>setFilter('selected')}><Heart size={15}/> Minhas favoritas <span>{selected.size}</span></button>}</div><div className="gallery-tools">{!isAdmin&&<button className="text-button" disabled={!clientReady} onClick={()=>{const s=selected.size===photos.length?new Set<string>():new Set(photos.map(p=>p.id));setSelected(s);try{localStorage.setItem('lume:'+token,JSON.stringify([...s]))}catch{}}}>{selected.size===photos.length&&photos.length?'Limpar seleção':'Selecionar todas'}</button>}<div className="grid-label"><Grid2X2 size={17}/></div></div></div>
{!isAdmin&&photos.length>0&&<section className="album-download" aria-label="Baixar álbum completo">
 <div><strong>Todas as suas fotos em um arquivo</strong><p>ZIP com as imagens originais · até 200 MB por download.</p>{busy==='zip'&&<p className="zip-progress" role="status">{progress}</p>}</div>
 <button className="btn" disabled={!!busy||!clientReady} onClick={()=>void downloadZip('all')}>{busy==='zip'?<Loader2 className="spin" size={18}/>:<Download size={18}/>}Baixar todas em ZIP <span className="button-count">{photos.length}</span></button>
</section>}
{!visible.length?<div className="empty"><Images size={35}/><h3>{filter==='selected'?'Suas favoritas vão aparecer aqui.':'Uma galeria de possibilidades.'}</h3><p>{isAdmin?'Envie suas primeiras fotografias para começar.':filter==='selected'?'Toque no coração nas fotos que você mais gosta.':'O fotógrafo ainda está preparando suas imagens.'}</p></div>:<div className="photo-grid">{visible.map((p,i)=><article className={'photo-card '+(selected.has(p.id)?'chosen':'')} key={p.id}><div className="photo-frame"><button className="photo-open" disabled={!clientReady} aria-label={isAdmin?'Ampliar '+p.name:'Ampliar '+photoLabel(p)} onClick={()=>setLight(photos.findIndex(x=>x.id===p.id))}><img src={img(p)} alt={isAdmin?p.alt||p.name:photoLabel(p)} loading={i>3?'lazy':'eager'}/><span className="expand-hint"><Expand size={18}/></span></button>{!isAdmin&&<button className={'heart '+(selected.has(p.id)?'checked':'')} aria-label={(selected.has(p.id)?'Desmarcar ':'Selecionar ')+photoLabel(p)} aria-pressed={selected.has(p.id)} disabled={!clientReady} onClick={()=>toggle(p.id)}><Heart size={19} fill={selected.has(p.id)?'currentColor':'none'}/></button>}<span className="photo-number">{String(photos.findIndex(x=>x.id===p.id)+1).padStart(2,'0')}</span></div><div className={'photo-caption '+(!isAdmin?'client-caption':'')}><span>{isAdmin?p.name:null}</span>{isAdmin?<button className="icon" title="Remover foto" onClick={()=>setDialog('delete:'+p.id)}><X size={15}/></button>:selected.has(p.id)?<span className="selected-label"><Check size={13}/> Selecionada</span>:null}</div></article>)}</div>}
{!isAdmin&&<div className="closing-note"><span><BrandSparkle/></span><p>Feitas para sentir. Escolhidas por você.</p><small>Suas favoritas ficam salvas neste navegador.</small></div>}
</>}
<footer className="page-footer"><span>LUME © 2026</span><span>FOTOGRAFIAS QUE CONTAM A SUA HISTÓRIA.</span><span>Feito com cuidado <span className="terracotta"><BrandSparkle/></span></span></footer>
</main>
{!isAdmin&&album&&<div className={'download-bar'+(barHidden?' is-hidden':'')} ref={downloadBar} inert={barHidden} aria-hidden={barHidden}><div className="selection-icon"><Heart size={20}/></div><div role="status" aria-live="polite" aria-atomic="true"><strong>{selected.size?selected.size+' '+(selected.size===1?'foto selecionada':'fotos selecionadas'):'Qual momento é o seu favorito?'}</strong><small>{busy==='download'||busy==='zip'?progress:'Selecione, guarde e reviva.'}</small></div><div className="download-actions"><button className="btn send" disabled={!selected.size||!!busy} onClick={()=>setDialog('send')}><Send size={16}/> Enviar seleção</button><button className="btn primary" disabled={!selected.size||!!busy} onClick={downloadSelected}>{busy==='download'?<Loader2 className="spin" size={17}/>:<Download size={17}/>}<span className="desktop-label">Baixar selecionadas</span><span className="mobile-label">Salvar fotos</span><span className="button-count">{selected.size}</span></button></div></div>}
{dialog==='zip-ready'&&zipFile&&<Modal label="Baixar fotos em ZIP" close={()=>{setDialog('');setZipFile(null)}}>
 <span className="eyebrow">{zipFile.scope==='all'?'ÁLBUM COMPLETO':'FOTOS SELECIONADAS'}</span><h2>Seu ZIP está pronto</h2>
 <p>{zipFile.scope==='all'?'Toque abaixo para baixar todas as fotos originais.':'Toque abaixo para baixar somente as fotos escolhidas.'}</p>
 <a className="btn primary full" href={zipFile.url} download={zipFile.name}><Download size={18}/>Baixar arquivo ZIP</a>
 <div className="save-instructions"><strong>No Android</strong><p>Abra Downloads no app Arquivos ou Files e use Extrair. Para ver as imagens na galeria, confira a pasta Downloads no seu app de fotos.</p><strong>No iPhone</strong><p>Abra Arquivos → Downloads e toque no ZIP para extrair. Depois, abra a pasta, selecione as fotos e use Compartilhar → Salvar imagens, se essa opção aparecer.</p></div>
</Modal>}
{dialog==='save-images'&&<Modal label="Salvar fotos" close={closeSaveImages}>
 <span className="eyebrow">SUAS FOTOS NO CELULAR</span>
 <h2>Salvar fotos</h2>
 <button className="btn primary full selected-zip" disabled={!!busy||!preparedPhotos.length} onClick={()=>void downloadZip('selected',preparedPhotos)}><Download size={18}/>Baixar selecionadas em ZIP <span className="button-count">{preparedPhotos.length}</span></button>
 {busy==='download'||busy==='zip'?<div className="save-progress" role="status"><Loader2 className="spin" size={24}/><p>{progress}</p></div>:null}
 {saveError&&<p className="save-message" role="alert">{saveError}</p>}
 {!!preparedImages.length&&<>
  <div className="save-instructions">
   <strong>Para salvar uma foto no celular</strong>
   <p>No Android: toque e segure a imagem e escolha “Fazer download da imagem” ou “Baixar imagem”. Confira a pasta Downloads no app de fotos ou em Arquivos.</p>
   <details><summary>Como salvar no iPhone</summary><p>Toque e segure a imagem e escolha “Salvar em Fotos”, “Adicionar a Fotos” ou “Salvar Imagem”. Se precisar, use “Abrir imagem original”.</p></details>
   <p>Se estiver no navegador do WhatsApp ou Instagram, abra o link no Chrome (Android) ou Safari (iPhone).</p>
  </div>
  <div className={'save-previews '+(preparedImages.length===1?'single':'')}>
   {preparedImages.map((file,index)=><figure key={index}>{preparedSources[index]&&<img src={preparedSources[index]} alt={'Foto '+String(index+1).padStart(2,'0')} draggable={false}/>}<figcaption><span>Foto {String(index+1).padStart(2,'0')}</span>{preparedSources[index]&&<a className="text-link" href={preparedSources[index]} target="_blank" rel="noopener">Abrir imagem original <Expand size={14}/></a>}</figcaption></figure>)}
  </div>
  {canShareImages(preparedImages)&&!shareUnavailable&&<div className="save-share-option">
   <p>Para enviar as fotos a outro aplicativo ou salvar em Arquivos:</p>
   <button className="btn full" disabled={nativeSaving} onClick={savePreparedImages}><Send size={18}/>Compartilhar arquivos</button>
  </div>}
 </>}
 {!busy&&!preparedImages.length&&<button className="btn full" onClick={closeSaveImages}>Voltar à galeria</button>}
</Modal>}

{dialog==='create'&&<Modal label="Criar galeria" close={()=>setDialog('')}><span className="eyebrow">UMA NOVA HISTÓRIA</span><h2>Nova galeria</h2><p>Um espaço exclusivo para as fotos do seu cliente.</p><form onSubmit={async e=>{e.preventDefault();setBusy('create');const f=new FormData(e.currentTarget);try{const d=await api('albums','POST',Object.fromEntries(f));await loadAlbums();await openAlbum(d.id,true);setDialog('');setToast('Galeria criada. Agora envie suas fotografias.')}catch(e:any){setError(e.message);setDialog('')}finally{setBusy('')}}}><label>Nome da galeria<input required name="title" maxLength={100} placeholder="Ex.: Ana & Gabriel"/></label><label>Nome do cliente<input required name="client" maxLength={100} placeholder="Para quem são essas memórias?"/></label><label>Data do ensaio ou evento<input required name="date" type="date" defaultValue={new Date().toLocaleDateString('en-CA')}/></label><button className="btn primary full" disabled={!!busy}><Plus size={17}/> Criar galeria</button></form></Modal>}
{dialog==='send'&&<Modal label="Enviar seleção" close={()=>setDialog('')}><Heart className="terracotta"/><h2>Estas são as suas favoritas?</h2><p>Envie as {selected.size} fotos escolhidas para o fotógrafo.</p><form onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);setBusy('send');try{await api('selection/'+token,'POST',{name:f.get('name'),photos:[...selected]});setDialog('');setToast('Seleção enviada para o fotógrafo!')}catch(e:any){setError(e.message);setDialog('')}finally{setBusy('')}}}><label>Seu nome<input name="name" required maxLength={120} placeholder="Como você se chama?"/></label><button className="btn primary full" disabled={!!busy}><Send size={16}/> Confirmar seleção</button></form></Modal>}
{dialog.startsWith('delete:')&&<Modal label="Remover fotografia" close={()=>setDialog('')}><h2>Remover esta foto?</h2><p>Ela deixará de aparecer na galeria do cliente. Guarde seu arquivo original antes de remover.</p><button className="btn primary full" disabled={!!busy} onClick={async()=>{setBusy('delete');try{await api('albums/'+album?.id+'/photos/'+dialog.slice(7),'DELETE');await openAlbum(album!.id);await loadAlbums();setToast('Foto removida.')}catch(e:any){setError(e.message)}finally{setBusy('');setDialog('')}}}>Remover foto</button></Modal>}
{dialog==='link'&&<Modal label="Link do cliente" close={()=>setDialog('')}><h2>Link do cliente</h2><p>Copie e compartilhe este endereço.</p><input readOnly value={typeof location!=='undefined'?location.origin+'/cliente/'+album?.token:''} onFocus={e=>e.target.select()}/></Modal>}
{light!==null&&photos[light]&&<Modal label={isAdmin?'Fotografia '+photos[light].name:photoLabel(photos[light])} close={()=>setLight(null)}><div className="lightbox"><div className="light-image" onTouchStart={e=>{touchStart.current=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null}} onTouchEnd={e=>{const start=touchStart.current;touchStart.current=null;if(!start||e.changedTouches.length!==1||e.touches.length)return;const dx=e.changedTouches[0].clientX-start.x,dy=e.changedTouches[0].clientY-start.y;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5)setLight((light+(dx<0?1:-1)+photos.length)%photos.length)}}><img src={img(photos[light])} alt={isAdmin?photos[light].alt||photos[light].name:photoLabel(photos[light])}/></div><div className="light-controls"><button className="icon" aria-label="Foto anterior" onClick={()=>setLight((light-1+photos.length)%photos.length)}><ArrowLeft/></button><span>{light+1} / {photos.length} {isAdmin&&<small>{photos[light].name}</small>}</span><button className="icon" aria-label="Próxima foto" onClick={()=>setLight((light+1)%photos.length)}><ArrowRight/></button>{!isAdmin&&<button className={'btn '+(selected.has(photos[light].id)?'primary':'')} onClick={()=>toggle(photos[light].id)}><Heart size={17} fill={selected.has(photos[light].id)?'currentColor':'none'}/>{selected.has(photos[light].id)?'Selecionada':'Selecionar'}</button>}{isAdmin?<a className="btn" href={img(photos[light],true)} download><Download size={17}/><span>Baixar foto</span></a>:<button className="btn photo-save" disabled={!!busy} onClick={()=>downloadSingle(photos[light])}><Download size={17}/><span className="desktop-label">Baixar foto</span><span className="mobile-label">Salvar foto</span></button>}</div></div></Modal>}
{notify}
</div>
}
