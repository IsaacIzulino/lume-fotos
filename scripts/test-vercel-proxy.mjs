import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { handler } from '../lib/vercel-api.ts';

test('Vercel API preserves authentication, origins and photo bytes', async t => {
  const seen=[];
  const image=Buffer.alloc(5*1024*1024,123);
  const upstream=createServer(async(req,res)=>{
    const parts=[];for await(const part of req)parts.push(part);
    const body=Buffer.concat(parts);
    seen.push({url:req.url,headers:req.headers,body});
    if(req.url==='/api/login'){
      res.setHeader('Set-Cookie','lume_session=test; HttpOnly; SameSite=Strict; Path=/; Secure');
      res.setHeader('Content-Type','application/json');return res.end('{}');
    }
    if(req.url==='/api/image/demo/demo-0?download=1'){
      res.setHeader('Content-Type','image/jpeg');
      res.setHeader('Content-Disposition','attachment; filename="foto.jpg"');
      return res.end(image);
    }
    if(req.url==='/api/albums'&&!req.headers.cookie){res.statusCode=401;res.setHeader('Content-Type','application/json');return res.end('{"error":"Entre para acessar sua área."}')}
    res.setHeader('Content-Type','application/json');res.end('{"ok":true}');
  });
  await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  const previous=process.env.LUME_API_ORIGIN;
  process.env.LUME_API_ORIGIN='http://127.0.0.1:'+upstream.address().port;
  try{
    await t.test('rejects forged origins before contacting the upstream',async()=>{
      const response=await handler(new Request('https://lume.example/api/login',{method:'POST',headers:{Origin:'https://other.example'},body:'{}'}));
      assert.equal(response.status,403);assert.equal(seen.length,0);
    });
    await t.test('uses the public host behind a Next.js reverse proxy',async()=>{
      const response=await handler(new Request('http://internal:3000/api/login',{method:'POST',headers:{Host:'lume.example','X-Forwarded-Proto':'https',Origin:'https://lume.example','Content-Type':'application/json'},body:'{}'}));
      assert.equal(response.status,200);await response.text();
    });
    await t.test('forwards login body and sets the browser session cookie',async()=>{
      const response=await handler(new Request('https://lume.example/api/login',{method:'POST',headers:{Origin:'https://lume.example','Content-Type':'application/json'},body:'{"username":"test","password":"fixture"}'}));
      assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/HttpOnly/);
      assert.equal(response.headers.get('x-lume-max-upload-mb'),'4');
      assert.equal(seen.at(-1).headers.origin,process.env.LUME_API_ORIGIN);
      assert.equal(JSON.parse(seen.at(-1).body.toString()).username,'test');
      await response.text();
    });
    await t.test('preserves unauthorized status and authenticated cookies',async()=>{
      assert.equal((await handler(new Request('https://lume.example/api/albums'))).status,401);
      const response=await handler(new Request('https://lume.example/api/albums',{headers:{Cookie:'lume_session=test'}}));
      assert.equal(response.status,200);assert.equal(seen.at(-1).headers.cookie,'lume_session=test');await response.text();
    });
    await t.test('forwards multipart photo uploads unchanged',async()=>{
      const form=new FormData();form.append('file',new File([new Uint8Array([137,80,78,71])],'teste.png',{type:'image/png'}));
      const response=await handler(new Request('https://lume.example/api/albums/test/photos',{method:'POST',headers:{Origin:'https://lume.example',Cookie:'lume_session=test'},body:form}));
      assert.equal(response.status,200);assert.match(seen.at(-1).headers['content-type'],/multipart\/form-data/);assert.match(seen.at(-1).body.toString(),/teste.png/);await response.text();
    });
    await t.test('streams large photo downloads with attachment headers',async()=>{
      const response=await handler(new Request('https://lume.example/api/image/demo/demo-0?download=1'));
      assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/attachment/);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),image);
    });
    await t.test('rejects oversized uploads before forwarding them',async()=>{
      const n=seen.length;const response=await handler(new Request('https://lume.example/api/albums/test/photos',{method:'POST',headers:{Origin:'https://lume.example','Content-Length':String(5*1024*1024)},body:'test'}));
      assert.equal(response.status,413);assert.equal(seen.length,n);
    });
  }finally{
    if(previous===undefined)delete process.env.LUME_API_ORIGIN;else process.env.LUME_API_ORIGIN=previous;
    upstream.closeAllConnections();await new Promise(resolve=>upstream.close(resolve));
  }
});
