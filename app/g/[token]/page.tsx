import { redirect } from 'next/navigation';
import Studio from '../../studio';export default async function Page({params}:{params:Promise<{token:string}>}){const {token}=await params;if(token==='demo')redirect('/cliente');return <Studio mode="gallery" token={token}/>}
