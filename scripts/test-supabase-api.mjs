import assert from 'node:assert/strict';
import {test} from 'node:test';
import {handler} from '../lib/supabase-api.ts';
import {uploadPhoto} from '../app/upload.ts';
test('Supabase login, ownership, storage and client selections',async t=>{
 const id=()=>crypto.randomUUID(),owner=id(),other=id(),uid=id(),secret='sb_secret_test_only',pub='sb_publishable_test_only',origin='https://fixture.supabase.co';
 const db={albuns:[],fotos:[],selecoes:[],selecao_fotos:[],lume_uploads:[],lume_sessoes:[]},objects=new Map();
 let active=true,cookie='',album,photo;
 const foreign={id:id(),fotografo_id:other,codigo_publico:'2'.repeat(32),publicado:true};db.albuns.push(foreign);
 const previousFetch=globalThis.fetch,keys=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY'];
 const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:origin,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:pub,SUPABASE_SECRET_KEY:secret});
 const response=(data,status=200)=>Response.json(data,{status});
 globalThis.fetch=async(input,init={})=>{
  const u=new URL(String(input)),method=init.method||'GET',h=new Headers(init.headers),body=typeof init.body==='string'?JSON.parse(init.body):init.body;
  assert.equal(u.origin,origin);
  if(u.pathname.startsWith('/storage/v1/object/upload/sign/fotos/')){
   const path=decodeURIComponent(u.pathname.slice('/storage/v1/object/upload/sign/fotos/'.length));
   if(method==='POST'){assert.equal(h.get('apikey'),secret);return response({url:'/object/upload/sign/fotos/'+path+'?token=test'})}
   assert.equal(method,'PUT');assert.equal(h.get('apikey'),pub);assert.equal(init.credentials,'omit');
   const file=[...body.values()].find(v=>v instanceof Blob);objects.set(path,new Uint8Array(await file.arrayBuffer()));return response({Key:path});
  }
  if(u.pathname.startsWith('/storage/v1/object/sign/fotos/')){
   const path=decodeURIComponent(u.pathname.slice('/storage/v1/object/sign/fotos/'.length));
   if(method==='POST'){assert.equal(h.get('apikey'),secret);return response({signedURL:'/object/sign/fotos/'+path+'?token=test'})}
   const bytes=objects.get(path);if(!bytes)return response({},404);
   return new Response(bytes.slice(0,32),{status:206,headers:{'Content-Range':'bytes 0-31/'+bytes.length}});
  }
  if(u.pathname==='/storage/v1/object/fotos'){assert.equal(method,'DELETE');for(const p of body.prefixes)objects.delete(p);return response([])}
  assert.equal(h.get('apikey'),secret);assert.equal(h.get('authorization'),null);
  const table=u.pathname.replace('/rest/v1/','');
  if(table==='rpc/lume_login'){
   if(body.p_usuario==='limited')return response({status:'limited'});
   if(body.p_usuario!=='victor'||body.p_senha!=='fixture-password')return response({status:'invalid'});
   assert.match(body.p_token_hash,/^[a-f0-9]{64}$/);assert.match(body.p_chave_limite,/^[a-f0-9]{64}$/);
   db.lume_sessoes.push({token_hash:body.p_token_hash,expira_em:new Date(Date.now()+28800000).toISOString(),usuario_id:uid});
   return response({status:'ok',usuario:'victor'});
  }
  if(table==='rpc/lume_enviar_selecao'){
   const a=db.albuns.find(a=>a.codigo_publico===body.p_codigo&&a.publicado);
   if(!a)return response({message:'LUME_GALERIA_INDISPONIVEL'},400);
   if(body.p_fotos.some(x=>!db.fotos.some(p=>p.id===x&&p.album_id===a.id)))return response({message:'LUME_SELECAO_INVALIDA'},400);
   const s={id:id(),album_id:a.id,nome_cliente:body.p_nome,criado_em:new Date().toISOString()};db.selecoes.push(s);
   db.selecao_fotos.push(...body.p_fotos.map(foto_id=>({album_id:a.id,selecao_id:s.id,foto_id})));return response(s.id);
  }
  assert.ok(table in db,'unknown table '+table);
  let found=db[table].filter(r=>[...u.searchParams].every(([k,v])=>{
   if(v.startsWith('eq.'))return String(r[k])===v.slice(3);
   if(v.startsWith('gt.'))return Date.parse(r[k])>Date.parse(v.slice(3));
   return true;
  }));
  if(method==='GET'){
   const offset=Number(u.searchParams.get('offset')||0),limit=Number(u.searchParams.get('limit')??1000);found=found.slice(offset,offset+limit);
   if(table==='lume_sessoes')found=found.map(r=>({...r,usuarios:{id:uid,usuario:'victor',fotografo_id:owner,ativo:active}}));
   if(table==='albuns'&&u.searchParams.get('select')?.includes('photo_count'))found=found.map(a=>({...a,photo_count:[{count:db.fotos.filter(p=>p.album_id===a.id).length}],selection_count:[{count:db.selecoes.filter(s=>s.album_id===a.id).length}],cover:db.fotos.filter(p=>p.album_id===a.id).slice(0,1)}));
   if(table==='selecoes')found=found.map(s=>({...s,selecao_fotos:db.selecao_fotos.filter(x=>x.selecao_id===s.id)}));
   return response(found);
  }
  if(method==='POST'){
   const row={id:id(),criado_em:new Date().toISOString(),...(table==='albuns'?{codigo_publico:id().replaceAll('-',''),publicado:false}:{}),...(table==='lume_uploads'?{expira_em:new Date(Date.now()+7200000).toISOString()}:{}),...body};
   if(!db[table].some(r=>r.id===row.id))db[table].push(row);return response([row],201);
  }
  if(method==='PATCH'){for(const r of found)Object.assign(r,body);return response(found)}
  if(method==='DELETE'){db[table]=db[table].filter(r=>!found.includes(r));if(table==='albuns')for(const n of ['fotos','selecoes','selecao_fotos','lume_uploads'])db[n]=db[n].filter(r=>!found.some(a=>a.id===r.album_id));return response(found)}
  throw Error('Unexpected method');
 };
 async function call(path,method='GET',body,headers={}){
  return handler(new Request('https://lume.example/api/'+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(method!=='GET'?{Origin:'https://lume.example'}:{}),...headers},body:body?JSON.stringify(body):undefined}));
 }
 const api=async(path,method,body)=>{const r=await call(path,method,body),b=await r.json();assert.ok(r.ok,JSON.stringify(b));return b};
 try{
  await t.test('configuration, CSRF and unauthenticated access fail closed',async()=>{
   delete process.env.SUPABASE_SECRET_KEY;assert.equal((await call('health')).status,503);assert.equal((await call('gallery/demo')).status,200);
   process.env.SUPABASE_SECRET_KEY=secret;assert.equal((await call('health')).status,200);
   assert.equal((await call('albums','POST',{})).status,401);
   assert.equal((await call('login','POST',{},{Origin:'https://attacker.example'})).status,403);
  });
  await t.test('username normalization, invalid passwords, rate-limit and session cookie',async()=>{
   assert.equal((await call('login','POST',{username:'victor',password:'wrong'})).status,401);
   assert.equal((await call('login','POST',{username:'limited',password:'wrong'})).status,429);
   const r=await call('login','POST',{username:' Victor ',password:'fixture-password'});assert.equal(r.status,200);
   assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);assert.match(r.headers.get('set-cookie'),/Secure/);
   cookie=r.headers.get('set-cookie').split(';')[0];assert.ok(!cookie.includes(db.lume_sessoes[0].token_hash));
   const me=await call('me');assert.equal(me.status,200);assert.equal(me.headers.get('x-lume-upload-mode'),'direct');assert.equal(me.headers.get('x-lume-max-upload-mb'),'25');
  });
  await t.test('photographers cannot read, mutate or sign uploads for others',async()=>{
   assert.deepEqual(await api('albums'),[]);
   for(const method of ['GET','PATCH','DELETE'])assert.equal((await call('albums/'+foreign.id,method,method==='PATCH'?{published:false}:undefined)).status,404);
   assert.equal((await call('albums/'+foreign.id+'/uploads','POST',{name:'x',size:1,mime:'image/png'})).status,404);
  });
  await t.test('album creation validates date and defaults to unpublished',async()=>{
   assert.equal((await call('albums','POST',{title:'x',client:'x',date:'2026-02-30'})).status,400);
   album=await api('albums','POST',{title:'Teste',client:'Cliente',date:'2026-10-25'});assert.equal((await call('gallery/'+album.token)).status,404);
  });
  await t.test('5 MB upload goes directly to storage and metadata is confirmed',async()=>{
   const bytes=new Uint8Array(5*1024*1024);bytes.set([137,80,78,71,13,10,26,10]);
   photo=await uploadPhoto(new File([bytes],'foto_ação.png',{type:'image/png'}),album.id,'direct',api);
   assert.equal(db.fotos.length,1);assert.equal(db.lume_uploads.length,0);assert.deepEqual(objects.get(db.fotos[0].caminho_storage),bytes);
   assert.equal((await call('albums/'+album.id+'/uploads','POST',{name:'x.png',size:26*1024*1024,mime:'image/png'})).status,400);
  });
  await t.test('invalid uploaded files are removed and never published',async()=>{
   const ticket=await api('albums/'+album.id+'/uploads','POST',{name:'bad.png',size:3,mime:'image/png'});
   const pending=db.lume_uploads.find(p=>p.id===ticket.id);objects.set(pending.caminho_storage,new TextEncoder().encode('bad'));
   assert.equal((await call('albums/'+album.id+'/uploads/'+ticket.id+'/complete','POST',{})).status,400);
   assert.equal(db.fotos.length,1);assert.equal(db.lume_uploads.length,0);assert.ok(!objects.has(pending.caminho_storage));
  });
  await t.test('public gallery, scoped download and atomic client selection',async()=>{
   await api('albums/'+album.id,'PATCH',{published:true});assert.equal((await api('gallery/'+album.token)).photos.length,1);
   const image=await call('image/'+album.token+'/'+photo.id+'?download=1');assert.equal(image.status,307);assert.ok(image.headers.get('location').includes('download=foto_'));
   assert.equal((await call('image/'+foreign.codigo_publico+'/'+photo.id)).status,404);
   assert.equal((await call('selection/'+album.token,'POST',{name:'Cliente',photos:[id()]})).status,400);
   assert.equal(db.selecoes.length,0);await api('selection/'+album.token,'POST',{name:'Cliente',photos:[photo.id]});
   const detail=await api('albums/'+album.id);assert.deepEqual(JSON.parse(detail.selections[0].photos),[photo.id]);
   assert.equal((await api('albums')).find(a=>a.id===album.id).selectionCount,1);
  });
  await t.test('unpublishing, disabled accounts and logout revoke access',async()=>{
   await api('albums/'+album.id,'PATCH',{published:false});assert.equal((await call('image/'+album.token+'/'+photo.id)).status,404);
   assert.equal((await call('selection/'+album.token,'POST',{name:'Cliente',photos:[photo.id]})).status,404);
   active=false;assert.equal((await call('me')).status,401);active=true;
   await api('albums/'+album.id,'DELETE');assert.equal(objects.size,0);
   await api('logout','POST');assert.equal((await call('me')).status,401);
  });
 }finally{globalThis.fetch=previousFetch;for(const[k,v]of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v}}
});
