# Lume — Galerias de fotografia

Galerias com painel do fotógrafo, login, upload de imagens, links públicos por álbum, seleção de favoritas e download em ZIP.

## Publicar na Vercel

O arquivo vercel.json seleciona Next.js, executa pnpm run build:vercel e usa a saída .next. A raiz do projeto deve ser a raiz deste repositório.

A interface roda na Vercel. A API usa o serviço já publicado em https://lume-galeria-fotografica.hsc162349.chatgpt.site, que mantém o banco D1, as fotos R2 e as sessões. Esse serviço precisa continuar ativo. O painel aceita o mesmo usuário e senha; os segredos permanecem no serviço de origem.

LUME_API_ORIGIN é opcional, somente no servidor, para usar outro backend compatível. Não configure como origem a própria URL da Vercel, pois isso criaria um loop.

As Vercel Functions têm limite de corpo de requisição de 4,5 MB. Por isso, nesta implantação o painel limita cada foto a 4 MB. No endereço original do Sites o limite continua em 25 MB. Para arquivos maiores na Vercel será necessário implementar upload direto ao armazenamento.

Comandos:
- pnpm install
- pnpm run build:vercel
- pnpm run start:vercel

Para desenvolvimento da interface com o backend publicado: pnpm run dev:vercel.

## Publicar no Sites / Cloudflare

O build original permanece disponível em pnpm run build, com a integração Vite/Vinext e os bindings DB (D1) e BUCKET (R2) declarados em .openai/hosting.json.

- pnpm run dev: prévia com Worker e armazenamento local.
- pnpm run build: build do Worker para Sites.
- pnpm run db:generate: gera novas migrações após alterações no schema.

A API do Worker está em lib/sites-api.ts. A API da Vercel está em lib/vercel-api.ts. O alias @lume-api seleciona a implementação adequada: Next.js usa tsconfig.json; Vite usa vite.config.ts.

Os segredos ADMIN_USERNAME e ADMIN_PASSWORD_HASH são configurados no ambiente do Worker. O hash usa salt hexadecimal + ":" + PBKDF2-SHA256 de 100.000 iterações e 32 bytes, em hexadecimal. Credenciais e arquivos .dev.vars/.env não devem ser enviados ao Git.

## Verificação

pnpm exec tsc --noEmit verifica os tipos. O build da Vercel precisa produzir .next/routes-manifest.json. Alterações na interface são publicadas na Vercel pelo GitHub; alterações na API do Worker precisam de uma publicação separada no Sites.
