import { env } from 'cloudflare:workers';
import { demoAlbum, demoPhotos } from '../app/demo';

const E=()=>env as unknown as {DB:D1Database;BUCKET:R2Bucket;ADMIN_PASSWORD_HASH:string;ADMIN_USERNAME:string};
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function fail(s:string,n=400):never{throw Object.assign(new Error(s),{status:n})}
const bytes=(s:string)=>new TextEncoder().encode(s);
const hex=(a:ArrayBuffer)=>Array.from(new Uint8Array(a),b=>b.toString(16).padStart(2,'0')).join('');
async function hash(s:string){return hex(await crypto.subtle.digest('SHA-256',bytes(s)))}
async function password(s:string,salt:string){const key=await crypto.subtle.importKey('raw',bytes(s),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:bytes(salt),iterations:100000,hash:'SHA-256'},key,256))}
function equal(a:string,b:string){let n=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)n|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return n===0}
async function admin(req:Request){const id=/lume_session=([^;]+)/.exec(req.headers.get('cookie')||'')?.[1];if(!id)fail('Entre para acessar sua área.',401);const row=await E().DB.prepare('SELECT id FROM sessions WHERE id=? AND expires>?').bind(await hash(id!),Date.now()).first();if(!row)fail('Sua sessão expirou. Entre novamente.',401)}
async function album(id:string){const a=await E().DB.prepare('SELECT * FROM albums WHERE id=?').bind(id).first<any>();if(!a)fail('Álbum não encontrado.',404);return a}
async function publicAlbum(token:string){const a=await E().DB.prepare('SELECT * FROM albums WHERE token=? AND published=1').bind(token).first<any>();if(!a)fail('Esta galeria não está disponível.',404);return a}
async function run(req:Request){
 const u=new URL(req.url),p=u.pathname.replace(/^\/api\//,'').split('/'),method=req.method,db=E().DB;
 if(method!=='GET'&&req.headers.get('origin')!==u.origin)fail('Origem não autorizada.',403);
 if(p[0]==='login'&&method==='POST'){
  if(!E().ADMIN_PASSWORD_HASH)fail('O acesso do fotógrafo ainda não foi configurado.',503);
  const key=await hash(req.headers.get('cf-connecting-ip')||'local'),now=Date.now();
  await db.prepare('INSERT INTO attempts(id,count,since) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=CASE WHEN since<? THEN 1 ELSE count+1 END,since=CASE WHEN since<? THEN excluded.since ELSE since END').bind(key,now,now-900000,now-900000).run();
  const a=await db.prepare('SELECT count FROM attempts WHERE id=?').bind(key).first<any>();if(a.count>10)fail('Muitas tentativas. Aguarde 15 minutos.',429);
  const b=await req.json() as any;if(typeof b.password!=='string'||b.password.length>256)fail('Usuário ou senha incorretos.',401);
  const [salt,expected]=E().ADMIN_PASSWORD_HASH.split(':');const actual=await password(b.password,salt);
  if(!equal(actual,expected)||!equal(String(b.username),E().ADMIN_USERNAME||'fotografo'))fail('Usuário ou senha incorretos.',401);
  const session=crypto.randomUUID()+crypto.randomUUID();await db.batch([db.prepare('DELETE FROM sessions WHERE expires<?').bind(now),db.prepare('INSERT INTO sessions VALUES(?,?)').bind(await hash(session),now+28800000),db.prepare('DELETE FROM attempts WHERE id=?').bind(key)]);
  return new Response('{}',{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':'lume_session='+session+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800'+(u.protocol==='https:'?'; Secure':'')}});
 }
 if(p[0]==='logout'&&method==='POST'){const id=/lume_session=([^;]+)/.exec(req.headers.get('cookie')||'')?.[1];if(id)await db.prepare('DELETE FROM sessions WHERE id=?').bind(await hash(id)).run();return new Response('{}',{headers:{'Content-Type':'application/json','Set-Cookie':'lume_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'}})}
 if(p[0]==='gallery'&&method==='GET'){
  if(p[1]==='demo')return json({album:demoAlbum,photos:demoPhotos});const a=await publicAlbum(p[1]);const photos=await db.prepare('SELECT * FROM photos WHERE album=? ORDER BY created,id').bind(a.id).all();return json({album:a,photos:photos.results});
 }
 if(p[0]==='image'&&method==='GET'){
  if(p[1]==='demo'){const d=demoPhotos.find(x=>x.id===p[2]);if(!d)fail('Foto não encontrada.',404);const r=await fetch(d!.url);if(!r.ok)fail('A foto de demonstração está indisponível.',502);return new Response(r.body,{headers:{'Content-Type':'image/jpeg','X-Content-Type-Options':'nosniff',...(u.searchParams.has('download')?{'Content-Disposition':'attachment; filename="'+d!.name+'"'}:{'Cache-Control':'public, max-age=3600'})}})}
  let a;if(u.searchParams.has('admin')){await admin(req);a=await album(p[1])}else a=await publicAlbum(p[1]);
  const photo=await db.prepare('SELECT * FROM photos WHERE id=? AND album=?').bind(p[2],a.id).first<any>();if(!photo)fail('Foto não encontrada.',404);const object=await E().BUCKET.get(photo.id);if(!object)fail('Arquivo não encontrado.',404);
  return new Response(object!.body,{headers:{'Content-Type':photo.mime,'Content-Length':String(photo.size),'Cache-Control':'private, max-age=0','X-Content-Type-Options':'nosniff',...(u.searchParams.has('download')?{'Content-Disposition':"attachment; filename=\"foto.jpg\"; filename*=UTF-8''"+encodeURIComponent(photo.name)}:{})}});
 }
 if(p[0]==='selection'&&method==='POST'){
  const b=await req.json() as any;if(!Array.isArray(b.photos)||b.photos.length<1||b.photos.length>1000||typeof b.name!=='string'||!b.name.trim()||b.name.length>120)fail('Informe seu nome e selecione ao menos uma foto.');
  if(p[1]==='demo')return json({ok:true,demo:true});const a=await publicAlbum(p[1]);const valid=await db.prepare('SELECT id FROM photos WHERE album=?').bind(a.id).all<any>();const allowed=new Set(valid.results.map(x=>x.id));if(b.photos.some((x:any)=>!allowed.has(x)))fail('A seleção contém fotos indisponíveis.');
  await db.prepare('INSERT INTO selections VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),a.id,b.name.trim(),JSON.stringify([...new Set(b.photos)]),Date.now()).run();return json({ok:true});
 }
 await admin(req);
 if(p[0]==='me')return json({username:E().ADMIN_USERNAME||'fotografo'});
 if(p[0]==='albums'&&p.length===1&&method==='GET'){const rows=await db.prepare('SELECT a.*,(SELECT COUNT(*) FROM photos WHERE album=a.id) AS count,(SELECT id FROM photos WHERE album=a.id ORDER BY created LIMIT 1) AS cover,(SELECT COUNT(*) FROM selections WHERE album=a.id) AS selectionCount FROM albums a ORDER BY created DESC').all();return json(rows.results)}
 if(p[0]==='albums'&&p.length===1&&method==='POST'){const b=await req.json() as any;if(typeof b.title!=='string'||!b.title.trim()||b.title.length>100||typeof b.client!=='string'||b.client.length>100||!/^\d{4}-\d{2}-\d{2}$/.test(b.date))fail('Preencha os dados do álbum.');const id=crypto.randomUUID(),token=crypto.randomUUID().replaceAll('-','');await db.prepare('INSERT INTO albums VALUES(?,?,?,?,?,?,?)').bind(id,token,b.title.trim(),b.client.trim(),b.date,0,Date.now()).run();return json({id,token},201)}
 if(p[0]==='albums'&&p[1]){
  const a=await album(p[1]);
  if(p.length===2&&method==='GET'){const [photos,selections]=await Promise.all([db.prepare('SELECT * FROM photos WHERE album=? ORDER BY created,id').bind(a.id).all(),db.prepare('SELECT * FROM selections WHERE album=? ORDER BY created DESC LIMIT 100').bind(a.id).all()]);return json({album:a,photos:photos.results,selections:selections.results})}
  if(p.length===2&&method==='PATCH'){const b=await req.json() as any;if(typeof b.published!=='boolean')fail('Estado inválido.');await db.prepare('UPDATE albums SET published=? WHERE id=?').bind(b.published?1:0,a.id).run();return json({ok:true})}
  if(p[2]==='photos'&&method==='POST'){
   const length=Number(req.headers.get('content-length')||0);if(length>26*1024*1024)fail('Cada foto pode ter até 25 MB.',413);
   const data=await req.formData(),file=data.get('file');if(!(file instanceof File)||file.size===0||file.size>25*1024*1024)fail('Envie uma imagem de até 25 MB.');
   const buf=await file.arrayBuffer(),v=new Uint8Array(buf);const mime=v[0]===255&&v[1]===216&&v[2]===255?'image/jpeg':v[0]===137&&v[1]===80&&v[2]===78&&v[3]===71?'image/png':String.fromCharCode(...v.slice(0,4))==='RIFF'&&String.fromCharCode(...v.slice(8,12))==='WEBP'?'image/webp':null;
   if(!mime)fail('Formato inválido. Use JPG, PNG ou WebP.');const id=crypto.randomUUID();await E().BUCKET.put(id,buf,{httpMetadata:{contentType:mime!}});try{await db.prepare('INSERT INTO photos VALUES(?,?,?,?,?,?)').bind(id,a.id,file.name.slice(0,200),mime,file.size,Date.now()).run()}catch(e){await E().BUCKET.delete(id);throw e}return json({id},201);
  }
  if(p[2]==='photos'&&p[3]&&method==='DELETE'){const photo=await db.prepare('SELECT id FROM photos WHERE id=? AND album=?').bind(p[3],a.id).first();if(!photo)fail('Foto não encontrada.',404);await E().BUCKET.delete(p[3]);await db.prepare('DELETE FROM photos WHERE id=? AND album=?').bind(p[3],a.id).run();return json({ok:true})}
 }
 return json({error:'Não encontrado.'},404);
}
export async function handler(req:Request){try{return await run(req)}catch(e:any){if(!e.status)console.error('API error',e.message);return json({error:e.status?e.message:'Não foi possível concluir. Tente novamente.'},e.status||500)}}
