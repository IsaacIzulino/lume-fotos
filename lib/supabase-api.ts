import { demoAlbum, demoPhotos } from '../app/demo.ts';

type RecordData = Record<string, any>;
class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = 'REQUEST_FAILED') { super(message); this.status = status; this.code = code; }
}
function fail(message: string, status = 400, code?: string): never { throw new ApiError(message, status, code); }
const MAX_PHOTO = 25 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const textBytes = (value: string) => new TextEncoder().encode(value);
async function hash(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', textBytes(value))), v => v.toString(16).padStart(2, '0')).join('');
}
function json(data: unknown, status = 200, extra?: HeadersInit) {
  return Response.json(data, { status, headers: {
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    'X-Lume-Max-Upload-MB': '25', 'X-Lume-Upload-Mode': 'direct', ...extra,
  } });
}
function config() {
  const source = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!source || !secret || !publishable || secret.startsWith('sb_publishable_') || secret === publishable) {
    fail('O serviço de fotos ainda não foi configurado.', 503, 'SUPABASE_CONFIG_REQUIRED');
  }
  let origin: URL;
  try { origin = new URL(source!); } catch { return fail('A configuração do serviço de fotos é inválida.', 503, 'SUPABASE_CONFIG_REQUIRED'); }
  if (origin.protocol !== 'https:' && !(process.env.NODE_ENV === 'test' && ['127.0.0.1', 'localhost'].includes(origin.hostname))) {
    fail('A configuração do serviço de fotos é inválida.', 503, 'SUPABASE_CONFIG_REQUIRED');
  }
  return { origin: origin.origin, secret: secret!, publishable: publishable! };
}
async function supabase(path: string, options: RequestInit = {}) {
  const c = config();
  const headers = new Headers(options.headers);
  headers.set('apikey', c.secret);
  // The legacy service_role JWT also works. Modern sb_secret keys use apikey.
  if (!c.secret.startsWith('sb_secret_')) headers.set('Authorization', 'Bearer ' + c.secret);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(c.origin + path, { ...options, headers, cache: 'no-store', signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    let data: RecordData = {};
    try { data = await response.json() as RecordData; } catch {}
    const setup = ['PGRST202', 'PGRST205', '42P01', '42883'].includes(data.code);
    if (setup) fail('O banco de dados ainda precisa concluir a configuração.', 503, 'SUPABASE_MIGRATION_REQUIRED');
    if (response.status === 401 || response.status === 403) fail('O serviço de fotos precisa revisar a chave do servidor.', 503, 'SUPABASE_SERVER_KEY_INVALID');
    if (typeof data.message === 'string' && data.message.includes('LUME_GALERIA_INDISPONIVEL')) fail('Esta galeria não está disponível.', 404);
    if (typeof data.message === 'string' && data.message.includes('LUME_SELECAO_INVALIDA')) fail('A seleção contém fotos indisponíveis.');
    if (response.status === 409) fail('Este registro já existe.', 409);
    console.error('Supabase request failed', response.status, data.code || data.error || 'unknown');
    fail('Não foi possível concluir a operação no serviço de fotos. Tente novamente.', 502);
  }
  return response;
}
async function requestJSON(path: string, method = 'GET', body?: unknown, headers?: HeadersInit) {
  const response = await supabase(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (response.status === 204) return null;
  const data = await response.text();
  return data ? JSON.parse(data) : null;
}
function restPath(table: string, query: Record<string, string | number> = {}) {
  return '/rest/v1/' + table + '?' + new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
}
async function rows(table: string, query: Record<string, string | number>) {
  return (await requestJSON(restPath(table, query))) as RecordData[];
}
async function allRows(table: string, query: Record<string, string | number>) {
  const result: RecordData[] = [];
  for (let offset = 0; ; offset += 1000) {
    const batch = await rows(table, { ...query, limit: 1000, offset });
    result.push(...batch);
    if (batch.length < 1000) return result;
  }
}
async function write(table: string, method: string, body: unknown, query: Record<string, string | number> = {}, prefer = 'return=representation') {
  return requestJSON(restPath(table, query), method, body, { Prefer: prefer });
}
async function input(request: Request): Promise<RecordData> {
  if (Number(request.headers.get('content-length') || 0) > 150000) fail('Solicitação muito grande.', 413);
  const source = await request.text();
  if (textBytes(source).length > 150000) fail('Solicitação muito grande.', 413);
  try {
    const value = JSON.parse(source);
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Dados inválidos.');
    return value;
  } catch { return fail('Dados inválidos.'); }
}
function sessionToken(request: Request) {
  const token = /(?:^|;\s*)lume_session=([^;]+)/.exec(request.headers.get('cookie') || '')?.[1];
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
async function admin(request: Request) {
  const token = sessionToken(request);
  if (!token) fail('Entre para acessar sua área.', 401);
  const found = await rows('lume_sessoes', {
    select: 'usuario_id,usuarios!inner(id,usuario,fotografo_id,ativo)',
    token_hash: 'eq.' + await hash(token!), expira_em: 'gt.' + new Date().toISOString(), limit: 1,
  });
  const user = found[0]?.usuarios;
  if (!user || !user.ativo) fail('Sua sessão expirou. Entre novamente.', 401);
  return user as { id: string; usuario: string; fotografo_id: string; ativo: boolean };
}
async function ownAlbum(id: string, photographer: string) {
  if (!UUID.test(id)) fail('Álbum não encontrado.', 404);
  const result = await rows('albuns', { select: '*', id: 'eq.' + id, fotografo_id: 'eq.' + photographer, limit: 1 });
  if (!result[0]) fail('Álbum não encontrado.', 404);
  return result[0];
}
async function publicAlbum(token: string) {
  if (!/^[a-f0-9]{32}$/.test(token)) fail('Esta galeria não está disponível.', 404);
  const result = await rows('albuns', { select: '*', codigo_publico: 'eq.' + token, publicado: 'eq.true', limit: 1 });
  if (!result[0]) fail('Esta galeria não está disponível.', 404);
  return result[0];
}
const albumData = (a: RecordData) => ({
  id: a.id, token: a.codigo_publico, title: a.titulo, client: a.nome_cliente,
  date: a.data_evento || '', published: a.publicado ? 1 : 0, created: Date.parse(a.criado_em),
});
const photoData = (p: RecordData) => ({
  id: p.id, name: p.nome_arquivo, size: Number(p.tamanho_bytes), mime: p.tipo_mime, created: Date.parse(p.criado_em),
});
const storagePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');
function absoluteStorageURL(value: string) {
  const c = config();
  const url = /^https?:\/\//.test(value) ? new URL(value)
    : new URL(value.startsWith('/storage/v1/') ? value : '/storage/v1' + (value.startsWith('/') ? value : '/' + value), c.origin);
  if (url.origin !== c.origin) fail('O armazenamento retornou um endereço inválido.', 502);
  return url;
}
async function signedDownload(path: string, name?: string) {
  const data = await requestJSON('/storage/v1/object/sign/fotos/' + storagePath(path), 'POST', { expiresIn: 60 });
  const value = data?.signedURL || data?.signedUrl || data?.url;
  if (typeof value !== 'string') fail('A foto está temporariamente indisponível.', 502);
  const url = absoluteStorageURL(value);
  if (name) url.searchParams.set('download', name);
  return url;
}
async function removeObjects(paths: string[]) {
  for (let index = 0; index < paths.length; index += 100) {
    await requestJSON('/storage/v1/object/fotos', 'DELETE', { prefixes: paths.slice(index, index + 100) });
  }
}
function imageType(value: Uint8Array) {
  if (value[0] === 255 && value[1] === 216 && value[2] === 255) return 'image/jpeg';
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => value[i] === v)) return 'image/png';
  const word = (start: number, end: number) => String.fromCharCode(...value.slice(start, end));
  if (word(0, 4) === 'RIFF' && word(8, 12) === 'WEBP') return 'image/webp';
  return null;
}
async function inspectUploaded(path: string) {
  const url = await signedDownload(path);
  const response = await fetch(url, { headers: { Range: 'bytes=0-31' }, cache: 'no-store', signal: AbortSignal.timeout(30000) });
  if (!response.ok || !response.body) fail('O envio ainda não terminou. Tente novamente.', 409);
  const range = response.headers.get('content-range');
  const total = range ? Number(/\/(\d+)$/.exec(range)?.[1]) : Number(response.headers.get('content-length'));
  const reader = response.body!.getReader(), prefix = new Uint8Array(32);
  let count = 0;
  try {
    while (count < 32) {
      const part = await reader.read();
      if (part.done) break;
      const take = Math.min(part.value.length, 32 - count);
      prefix.set(part.value.subarray(0, take), count); count += take;
    }
  } finally { await reader.cancel(); }
  return { size: total, mime: imageType(prefix.subarray(0, count)) };
}
function mutationOrigin(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get('host') || url.host;
  const protocol = request.headers.get('x-forwarded-proto') || url.protocol.slice(0, -1);
  if (request.headers.get('origin') !== protocol + '://' + host) fail('Origem não autorizada.', 403);
}
async function run(request: Request): Promise<Response> {
  const url = new URL(request.url), parts = url.pathname.replace(/^\/api\//, '').split('/'), method = request.method;
  if (!['GET', 'HEAD'].includes(method)) mutationOrigin(request);

  // The demo does not depend on database availability.
  if (parts[0] === 'gallery' && parts[1] === 'demo' && method === 'GET') return json({ album: demoAlbum, photos: demoPhotos });
  if (parts[0] === 'selection' && parts[1] === 'demo' && method === 'POST') return json({ ok: true, demo: true });
  if (parts[0] === 'image' && parts[1] === 'demo' && method === 'GET') {
    const photo = demoPhotos.find(p => p.id === parts[2]);
    if (!photo) fail('Foto não encontrada.', 404);
    const response = await fetch(photo!.url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) fail('A foto de demonstração está indisponível.', 502);
    return new Response(response.body, { headers: {
      'Content-Type': 'image/jpeg', 'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      ...(url.searchParams.has('download') ? { 'Content-Disposition': 'attachment; filename="' + photo!.name + '"' } : {}),
    } });
  }
  if (parts[0] === 'health' && method === 'GET') {
    config();
    await rows('lume_sessoes', { select: 'token_hash', limit: 0 });
    await rows('lume_uploads', { select: 'id', limit: 0 });
    return json({ backend: 'supabase', ready: true });
  }
  if (parts[0] === 'login' && method === 'POST') {
    const b = await input(request);
    if (typeof b.username !== 'string' || typeof b.password !== 'string' ||
        b.username.trim().length < 3 || b.username.trim().length > 80 ||
        textBytes(b.password).length < 1 || textBytes(b.password).length > 72) fail('Usuário ou senha incorretos.', 401);
    const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
    // x-vercel-forwarded-for is platform-owned; no forwarded IP is trusted elsewhere.
    const ip = process.env.VERCEL === '1' ? request.headers.get('x-vercel-forwarded-for') || 'unknown' : 'local';
    const limiter = await hash(config().secret + ':login:' + ip);
    const result = await requestJSON('/rest/v1/rpc/lume_login', 'POST', {
      p_usuario: b.username.trim().toLowerCase(), p_senha: b.password,
      p_chave_limite: limiter, p_token_hash: await hash(token),
    });
    if (result?.status === 'limited') fail('Muitas tentativas. Aguarde 15 minutos.', 429);
    if (result?.status !== 'ok') fail('Usuário ou senha incorretos.', 401);
    const secure = (request.headers.get('x-forwarded-proto') || url.protocol.slice(0, -1)) === 'https';
    return json({ username: result.usuario }, 200, {
      'Set-Cookie': 'lume_session=' + token + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800' + (secure ? '; Secure' : ''),
    });
  }
  if (parts[0] === 'logout' && method === 'POST') {
    const token = sessionToken(request);
    if (token) await write('lume_sessoes', 'DELETE', undefined, { token_hash: 'eq.' + await hash(token) }, 'return=minimal');
    return json({ ok: true }, 200, { 'Set-Cookie': 'lume_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Secure' });
  }
  if (parts[0] === 'gallery' && method === 'GET') {
    const a = await publicAlbum(parts[1]);
    const photos = await allRows('fotos', { select: '*', album_id: 'eq.' + a.id, order: 'ordem.asc,criado_em.asc,id.asc' });
    return json({ album: albumData(a), photos: photos.map(photoData) });
  }
  if (parts[0] === 'image' && method === 'GET') {
    const a = url.searchParams.has('admin') ? await ownAlbum(parts[1], (await admin(request)).fotografo_id) : await publicAlbum(parts[1]);
    if (!UUID.test(parts[2] || '')) fail('Foto não encontrada.', 404);
    const result = await rows('fotos', { select: '*', id: 'eq.' + parts[2], album_id: 'eq.' + a.id, limit: 1 });
    if (!result[0]) fail('Foto não encontrada.', 404);
    const location = await signedDownload(result[0].caminho_storage, url.searchParams.has('download') ? result[0].nome_arquivo : undefined);
    return new Response(null, { status: 307, headers: { Location: location.toString(), 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
  }
  if (parts[0] === 'selection' && method === 'POST') {
    const b = await input(request);
    if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 120 || !Array.isArray(b.photos) ||
        !b.photos.length || b.photos.length > 1000 || b.photos.some((id: unknown) => typeof id !== 'string' || !UUID.test(id))) fail('Informe seu nome e selecione ao menos uma foto.');
    if (!/^[a-f0-9]{32}$/.test(parts[1])) fail('Esta galeria não está disponível.', 404);
    const id = await requestJSON('/rest/v1/rpc/lume_enviar_selecao', 'POST', { p_codigo: parts[1], p_nome: b.name.trim(), p_fotos: [...new Set(b.photos)] });
    return json({ ok: true, id });
  }

  const user = await admin(request);
  if (parts[0] === 'me' && method === 'GET') return json({ username: user.usuario });
  if (parts[0] !== 'albums') fail('Não encontrado.', 404);
  if (parts.length === 1 && method === 'GET') {
    const albums = await allRows('albuns', {
      select: '*,photo_count:fotos(count),selection_count:selecoes(count),cover:fotos(id)',
      fotografo_id: 'eq.' + user.fotografo_id, order: 'criado_em.desc',
      'cover.limit': 1, 'cover.order': 'ordem.asc,criado_em.asc,id.asc',
    });
    return json(albums.map(a => ({ ...albumData(a), count: a.photo_count?.[0]?.count || 0, selectionCount: a.selection_count?.[0]?.count || 0, cover: a.cover?.[0]?.id || null })));
  }
  if (parts.length === 1 && method === 'POST') {
    const b = await input(request);
    if (typeof b.title !== 'string' || !b.title.trim() || b.title.length > 100 ||
        typeof b.client !== 'string' || !b.client.trim() || b.client.length > 100 ||
        typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date) ||
        Number.isNaN(Date.parse(b.date + 'T12:00:00Z')) || new Date(b.date + 'T12:00:00Z').toISOString().slice(0, 10) !== b.date) fail('Preencha os dados do álbum.');
    const result = await write('albuns', 'POST', { fotografo_id: user.fotografo_id, titulo: b.title.trim(), nome_cliente: b.client.trim(), data_evento: b.date });
    return json({ id: result[0].id, token: result[0].codigo_publico }, 201);
  }
  const a = await ownAlbum(parts[1], user.fotografo_id);
  if (parts.length === 2 && method === 'GET') {
    const [photos, selections] = await Promise.all([
      allRows('fotos', { select: '*', album_id: 'eq.' + a.id, order: 'ordem.asc,criado_em.asc,id.asc' }),
      allRows('selecoes', { select: '*,selecao_fotos(foto_id)', album_id: 'eq.' + a.id, order: 'criado_em.desc' }),
    ]);
    return json({ album: albumData(a), photos: photos.map(photoData), selections: selections.map(s => ({
      id: s.id, name: s.nome_cliente, created: Date.parse(s.criado_em),
      photos: JSON.stringify((s.selecao_fotos || []).map((p: RecordData) => p.foto_id)),
    })) });
  }
  if (parts.length === 2 && method === 'PATCH') {
    const b = await input(request);
    if (typeof b.published !== 'boolean') fail('Estado inválido.');
    await write('albuns', 'PATCH', { publicado: b.published }, { id: 'eq.' + a.id, fotografo_id: 'eq.' + user.fotografo_id }, 'return=minimal');
    return json({ ok: true });
  }
  if (parts.length === 2 && method === 'DELETE') {
    const [photos, pending] = await Promise.all([
      allRows('fotos', { select: 'caminho_storage', album_id: 'eq.' + a.id }),
      allRows('lume_uploads', { select: 'caminho_storage', album_id: 'eq.' + a.id }),
    ]);
    await removeObjects([...photos, ...pending].map(p => p.caminho_storage));
    await write('albuns', 'DELETE', undefined, { id: 'eq.' + a.id, fotografo_id: 'eq.' + user.fotografo_id }, 'return=minimal');
    return json({ ok: true });
  }
  if (parts[2] === 'uploads' && parts.length === 3 && method === 'POST') {
    const b = await input(request);
    if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 255 ||
        !['image/jpeg', 'image/png', 'image/webp'].includes(b.mime) ||
        !Number.isSafeInteger(b.size) || b.size < 1 || b.size > MAX_PHOTO) fail('Envie uma imagem JPG, PNG ou WebP de até 25 MB.');
    const id = crypto.randomUUID(), extension = b.mime === 'image/jpeg' ? 'jpg' : b.mime === 'image/png' ? 'png' : 'webp';
    const path = user.fotografo_id + '/' + a.id + '/' + id + '.' + extension;
    await write('lume_uploads', 'POST', {
      id, album_id: a.id, fotografo_id: user.fotografo_id, nome_arquivo: b.name.trim(), caminho_storage: path, tipo_mime: b.mime, tamanho_bytes: b.size,
    }, {}, 'return=minimal');
    try {
      const signed = await requestJSON('/storage/v1/object/upload/sign/fotos/' + storagePath(path), 'POST', { upsert: false }, { 'x-upsert': 'false' });
      const value = signed?.url || signed?.signedURL || signed?.signedUrl;
      if (typeof value !== 'string') fail('Não foi possível preparar o envio.', 502);
      return json({ id, url: absoluteStorageURL(value).toString(), apiKey: config().publishable }, 201);
    } catch (error) {
      await write('lume_uploads', 'DELETE', undefined, { id: 'eq.' + id, fotografo_id: 'eq.' + user.fotografo_id }, 'return=minimal').catch(() => {});
      throw error;
    }
  }
  if (parts[2] === 'uploads' && parts[3] && UUID.test(parts[3])) {
    const pending = (await rows('lume_uploads', { select: '*', id: 'eq.' + parts[3], album_id: 'eq.' + a.id, fotografo_id: 'eq.' + user.fotografo_id, limit: 1 }))[0];
    if (method === 'DELETE' && parts.length === 4) {
      if (!pending) return json({ ok: true });
      await removeObjects([pending.caminho_storage]);
      await write('lume_uploads', 'DELETE', undefined, { id: 'eq.' + pending.id, fotografo_id: 'eq.' + user.fotografo_id }, 'return=minimal');
      return json({ ok: true });
    }
    if (method === 'POST' && parts[4] === 'complete' && parts.length === 5) {
      const existing = (await rows('fotos', { select: 'id', id: 'eq.' + parts[3], album_id: 'eq.' + a.id, limit: 1 }))[0];
      if (existing) return json({ id: existing.id });
      if (!pending || Date.parse(pending.expira_em) < Date.now()) fail('O prazo deste envio terminou. Envie a foto novamente.', 410);
      const actual = await inspectUploaded(pending.caminho_storage);
      if (!actual.mime || actual.mime !== pending.tipo_mime || actual.size !== Number(pending.tamanho_bytes) || actual.size > MAX_PHOTO) {
        await removeObjects([pending.caminho_storage]);
        await write('lume_uploads', 'DELETE', undefined, { id: 'eq.' + pending.id }, 'return=minimal');
        fail('O arquivo enviado não corresponde a uma imagem válida.');
      }
      await write('fotos', 'POST', {
        id: pending.id, album_id: a.id, nome_arquivo: pending.nome_arquivo,
        caminho_storage: pending.caminho_storage, tipo_mime: actual.mime, tamanho_bytes: actual.size,
      }, {}, 'resolution=ignore-duplicates,return=minimal');
      await write('lume_uploads', 'DELETE', undefined, { id: 'eq.' + pending.id }, 'return=minimal');
      return json({ id: pending.id }, 201);
    }
  }
  if (parts[2] === 'photos' && parts[3] && method === 'DELETE' && parts.length === 4) {
    if (!UUID.test(parts[3])) fail('Foto não encontrada.', 404);
    const photo = (await rows('fotos', { select: '*', id: 'eq.' + parts[3], album_id: 'eq.' + a.id, limit: 1 }))[0];
    if (!photo) fail('Foto não encontrada.', 404);
    await removeObjects([photo.caminho_storage]);
    await write('fotos', 'DELETE', undefined, { id: 'eq.' + photo.id, album_id: 'eq.' + a.id }, 'return=minimal');
    return json({ ok: true });
  }
  fail('Não encontrado.', 404);
}
export async function handler(request: Request): Promise<Response> {
  try { return await run(request); }
  catch (error: unknown) {
    if (error instanceof ApiError) return json({ error: error.message, code: error.code }, error.status);
    console.error('Photo API unavailable', error instanceof Error ? error.name : 'unknown');
    return json({ error: 'O serviço de fotos está temporariamente indisponível. Tente novamente.', code: 'SERVICE_UNAVAILABLE' }, 502);
  }
}
