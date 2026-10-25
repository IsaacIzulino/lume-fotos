import assert from 'node:assert/strict';
import {test} from 'node:test';
import {preparePhotoFiles,canShareImages,shareImages,MOBILE_PHOTO_LIMIT} from '../app/download.ts';

test('prepares original image files with neutral names, not a ZIP',async()=>{
 const original=[new Uint8Array([255,216,255,1,2,3]),new Uint8Array([137,80,78,71,13,10,26,10])];
 const photos=original.map((bytes,index)=>({id:String(index),size:bytes.length,name:'nome-privado-'+index+'.jpg'})),progress=[];
 const files=await preparePhotoFiles(photos,async photo=>new Response(original[Number(photo.id)],{headers:{'Content-Type':photo.id==='0'?'image/jpeg':'image/png'}}),(current,total)=>progress.push([current,total]));
 assert.deepEqual(files.map(file=>file.name),['foto-01.jpg','foto-02.png']);
 assert.deepEqual(files.map(file=>file.type),['image/jpeg','image/png']);
 for(let index=0;index<files.length;index++)assert.deepEqual(new Uint8Array(await files[index].arrayBuffer()),original[index]);
 assert.deepEqual(progress,[[1,2],[2,2]]);
});
test('rejects empty, oversized and non-image responses',async()=>{
 let calls=0;
 const load=async()=>{calls++;return new Response('bad',{headers:{'Content-Type':'text/html'}})};
 await assert.rejects(()=>preparePhotoFiles([],load),/Selecione/);
 await assert.rejects(()=>preparePhotoFiles([{id:'x',size:MOBILE_PHOTO_LIMIT+1}],load),/100 MB/);
 assert.equal(calls,0);
 await assert.rejects(()=>preparePhotoFiles([{id:'x',size:3}],load),/imagem compatível/);
});
test('canceling stops remaining downloads',async()=>{
 const controller=new AbortController();let calls=0;
 await assert.rejects(()=>preparePhotoFiles([{id:'1',size:1},{id:'2',size:1}],async()=>{
  calls++;controller.abort();return new Response(new Uint8Array([1]),{headers:{'Content-Type':'image/jpeg'}});
 },()=>{},controller.signal),error=>error.name==='AbortError');
 assert.equal(calls,1);
});
test('native sharing is invoked on the save tap, using prepared File objects',async()=>{
 const files=[new File([new Uint8Array([255,216,255])],'foto-01.jpg',{type:'image/jpeg'})];let called=false,received;
 const nav={canShare:data=>data.files===files,share:data=>{called=true;received=data;return Promise.resolve()}};
 assert.equal(canShareImages(files,nav),true);
 const pending=shareImages(files,nav);
 assert.equal(called,true);
 await pending;assert.equal(received.files,files);assert.equal(received.url,undefined);
 assert.equal(canShareImages(files,undefined),false);
 assert.equal(canShareImages(files,{canShare:()=>{throw Error('blocked')},share:()=>Promise.resolve()}),false);
});
test('unsupported sharing fails explicitly; a canceled native sheet stays canceled',async()=>{
 const files=[new File(['fixture'],'foto-01.jpg',{type:'image/jpeg'})];
 await assert.rejects(()=>shareImages(files,{canShare:()=>false,share:()=>Promise.resolve()}),/Use a opção/);
 await assert.rejects(()=>shareImages(files,{canShare:()=>true,share:()=>Promise.reject(new DOMException('cancel','AbortError'))}),error=>error.name==='AbortError');
});
