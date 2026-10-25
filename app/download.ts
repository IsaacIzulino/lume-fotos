export type GalleryPhoto = {id:string;size:number;mime?:string};
export const MOBILE_PHOTO_LIMIT = 100 * 1024 * 1024;
export function canShareImages(files:File[], nav:Pick<Navigator,'share'|'canShare'>|undefined = typeof navigator==='undefined'?undefined:navigator) {
  if (!files.length || !nav?.share || !nav.canShare) return false;
  try { return nav.canShare({files}); } catch { return false; }
}
export async function preparePhotoFiles(
  photos:GalleryPhoto[],
  load:(photo:GalleryPhoto)=>Promise<Response>,
  progress:(current:number,total:number)=>void=()=>{},
  signal?:AbortSignal,
) {
  if (!photos.length) throw new Error('Selecione pelo menos uma foto.');
  if (photos.reduce((sum,p)=>sum+p.size,0)>MOBILE_PHOTO_LIMIT) throw new Error('Salve até 100 MB de fotos por vez. Selecione menos imagens.');
  const files:File[]=[];let total=0;
  for (let index=0;index<photos.length;index++) {
    signal?.throwIfAborted();
    progress(index+1,photos.length);
    const response=await load(photos[index]);
    if (!response.ok) throw new Error('Não foi possível preparar a foto '+(index+1)+'. Tente novamente.');
    const blob=await response.blob();
    const mime=(blob.type||photos[index].mime||'').split(';')[0].toLowerCase();
    const extension=mime==='image/jpeg'?'jpg':mime==='image/png'?'png':mime==='image/webp'?'webp':null;
    if (!extension) throw new Error('O arquivo recebido não é uma imagem compatível.');
    total+=blob.size;
    if(total>MOBILE_PHOTO_LIMIT)throw new Error('Salve até 100 MB de fotos por vez. Selecione menos imagens.');
    files.push(new File([blob],'foto-'+String(index+1).padStart(2,'0')+'.'+extension,{type:mime}));
  }
  signal?.throwIfAborted();
  return files;
}
export async function shareImages(files:File[], nav:Pick<Navigator,'share'|'canShare'> = navigator) {
  if (!canShareImages(files,nav)) throw new Error('Use a opção de salvar em cada imagem abaixo.');
  // Called directly by a new button tap, after all downloads have completed.
  await nav.share({files});
}
