const DEFAULT_API_ORIGIN = 'https://lume-galeria-fotografica.hsc162349.chatgpt.site';
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
function error(message: string, status: number) {
  return Response.json({error: message}, {status, headers: {'Cache-Control': 'no-store', 'X-Lume-Max-Upload-MB': '4'}});
}
// Vercel serves Next.js; the existing Sites deployment retains D1, R2 and sessions.
export async function handler(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  // Next.js may construct request.url with an internal hostname behind a proxy.
  const host = request.headers.get('host') || incoming.host;
  const protocol = request.headers.get('x-forwarded-proto') || incoming.protocol.slice(0, -1);
  const publicOrigin = protocol + '://' + host;
  if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('origin') !== publicOrigin) {
    return error('Origem não autorizada.', 403);
  }
  const configured = new URL(process.env.LUME_API_ORIGIN || DEFAULT_API_ORIGIN);
  if (!['https:', 'http:'].includes(configured.protocol) || configured.username || configured.password || configured.origin === incoming.origin) {
    return error('A origem da API está configurada incorretamente.', 503);
  }
  const target = new URL(incoming.pathname + incoming.search, configured.origin);
  const headers = new Headers();
  for (const key of ['cookie', 'content-type', 'accept']) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  if (!['GET', 'HEAD'].includes(request.method)) headers.set('origin', configured.origin);
  if (Number(request.headers.get('content-length') || 0) > MAX_REQUEST_BYTES + 65536) {
    return error('Na Vercel, cada foto pode ter até 4 MB.', 413);
  }
  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      duplex: 'half',
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(60000),
    } as RequestInit & {duplex: 'half'});
    const outgoing = new Headers();
    for (const key of ['content-type', 'content-disposition', 'set-cookie', 'x-content-type-options']) {
      const value = response.headers.get(key);
      if (value) outgoing.set(key, value);
    }
    outgoing.set('Cache-Control', 'private, no-store');
    outgoing.set('X-Lume-Max-Upload-MB', '4');
    return new Response(response.body, {status: response.status, headers: outgoing});
  } catch {
    return error('O serviço de fotos está temporariamente indisponível. Tente novamente.', 502);
  }
}
