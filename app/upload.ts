export type UploadAPI = (path: string, method?: string, body?: unknown) => Promise<any>;
function detectMime(value: Uint8Array) {
  if (value[0] === 255 && value[1] === 216 && value[2] === 255) return 'image/jpeg';
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => value[i] === v)) return 'image/png';
  const word = (a: number, b: number) => String.fromCharCode(...value.slice(a, b));
  if (word(0, 4) === 'RIFF' && word(8, 12) === 'WEBP') return 'image/webp';
  return null;
}
export async function uploadPhoto(file: File, albumId: string, mode: string, api: UploadAPI) {
  if (mode !== 'direct') {
    const data = new FormData(); data.append('file', file);
    return api('albums/' + albumId + '/photos', 'POST', data);
  }
  const mime = detectMime(new Uint8Array(await file.slice(0, 32).arrayBuffer()));
  if (!mime) throw new Error('Formato não reconhecido. Use uma foto JPG, PNG ou WebP.');
  if (!file.size || file.size > 25 * 1024 * 1024) throw new Error('Cada foto deve ter entre 1 byte e 25 MB.');
  const prefix = 'albums/' + albumId + '/uploads';
  const ticket = await api(prefix, 'POST', { name: file.name, size: file.size, mime });
  try {
    const data = new FormData();
    data.append('cacheControl', '60');
    data.append('', new Blob([file], { type: mime }), file.name);
    const response = await fetch(ticket.url, {
      method: 'PUT', headers: { apikey: ticket.apiKey, 'x-upsert': 'false' },
      body: data, credentials: 'omit', signal: AbortSignal.timeout(300000),
    });
    if (!response.ok) {
      let message = 'O armazenamento não recebeu a foto. Tente novamente.';
      if (response.status === 413) message = 'O armazenamento recusou o tamanho da foto.';
      if (response.status === 401 || response.status === 403) message = 'A autorização de envio expirou. Escolha a foto novamente.';
      throw new Error(message);
    }
    let error: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await api(prefix + '/' + ticket.id + '/complete', 'POST', {}); }
      catch (failure: any) {
        error = failure;
        if (failure.status && failure.status < 500 && failure.status !== 409) break;
      }
    }
    throw error;
  } catch (failure: unknown) {
    // Retain pending files: a network error can happen after Storage accepted the bytes.
    const error = failure instanceof Error ? failure : new Error('Não foi possível confirmar a foto.');
    throw Object.assign(error, { uploadId: ticket.id });
  }
}
