import Studio from '../../studio';export default async function Page({params}:{params:Promise<{token:string}>}){const {token}=await params;return <Studio mode="gallery" token={token}/>}
