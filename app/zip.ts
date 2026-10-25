// Store-mode ZIP with UTF-8 filenames and CRC32, preserving uploaded originals.
export function zip(files:{name:string;data:Uint8Array}[]){
 const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0}
 const crc=(a:Uint8Array)=>{let c=0xffffffff;for(const b of a)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0};
 const parts:BlobPart[]=[],central:BlobPart[]=[];let offset=0,centralSize=0;
 for(const f of files){const name=new TextEncoder().encode(f.name.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_'));const c=crc(f.data);const local=new Uint8Array(30),l=new DataView(local.buffer);l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);l.setUint32(14,c,true);l.setUint32(18,f.data.length,true);l.setUint32(22,f.data.length,true);l.setUint16(26,name.length,true);parts.push(local,name,f.data as BlobPart);const entry=new Uint8Array(46),v=new DataView(entry.buffer);v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint32(16,c,true);v.setUint32(20,f.data.length,true);v.setUint32(24,f.data.length,true);v.setUint16(28,name.length,true);v.setUint32(42,offset,true);central.push(entry,name);centralSize+=46+name.length;offset+=30+name.length+f.data.length}
 const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,centralSize,true);v.setUint32(16,offset,true);return new Blob([...parts,...central,end],{type:'application/zip'});
}

