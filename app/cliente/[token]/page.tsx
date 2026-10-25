import { notFound } from 'next/navigation';
import Studio from '../../studio';
export default async function Page({params}:{params:Promise<{token:string}>}){
  const {token}=await params;if(token==='demo')notFound();
  return <Studio mode="gallery" token={token}/>;
}
