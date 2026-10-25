# Lume — Galerias de fotografia

Site para entrega de fotografias: painel do fotógrafo, álbuns por link, favoritas, envio de seleção e download dos originais em ZIP.

## Vercel + Supabase

A Vercel executa Next.js. A API em lib/supabase-api.ts usa diretamente o Supabase: banco PostgreSQL, bucket privado fotos e login próprio pela tabela usuarios. A implantação da Vercel não usa o serviço antigo de Cloudflare como proxy.

Configure na Vercel, para Production e Preview:

| Variável | Tipo |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | Config: origem do projeto, sem /rest/v1/ |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Config: chave publicável |
| SUPABASE_SECRET_KEY | Secret: chave administrativa, somente no servidor |

A chave legada SUPABASE_SERVICE_ROLE_KEY também é aceita se SUPABASE_SECRET_KEY não existir. Nenhuma chave real ou senha deve ser incluída no repositório.

As tabelas fotografos, usuarios, albuns, fotos, selecoes e selecao_fotos devem estar criadas no projeto. Execute supabase/migrations/20261025_integracao.sql no SQL Editor para adicionar sessões, limite de tentativas e uploads pendentes. A migração é repetível e preserva os cadastros existentes. O bucket fotos deve existir; a migração o mantém privado e limita imagens a 25 MB.

O cadastro usuarios armazena usuario em minúsculas e senha_hash bcrypt (pgcrypto, bf, custo 12). O login aceita variações de maiúsculas e minúsculas. O servidor verifica a senha por RPC e mantém somente o hash do token de sessão no banco, com validade de oito horas e cookie HttpOnly/SameSite=Strict. Contas inativas e sessões encerradas perdem o acesso.

As credenciais administrativas do Supabase ficam no servidor. Todas as operações do painel verificam a sessão e a propriedade do álbum. Clientes acessam apenas álbuns publicados por código aleatório. A seleção é gravada em uma transação que verifica se todas as fotos pertencem ao álbum.

## Upload e download

1. O fotógrafo solicita uma autorização de upload para um caminho exclusivo.
2. O navegador envia o arquivo diretamente ao Supabase Storage com uma URL assinada.
3. O servidor confere tamanho e assinatura do arquivo antes de registrar a foto no álbum.
4. As fotos privadas são liberadas por links assinados de 60 segundos, após validar o álbum e o visitante.

O limite é 25 MB por foto. Os arquivos não passam pelo corpo de uma Vercel Function. Confirmações interrompidas são repetidas sem reenviar o arquivo. Ao abrir o álbum, arquivos pendentes válidos são recuperados; falhas de rede não apagam os originais. Registros pendentes antigos podem ser revisados em lume_uploads; nunca exclua caminhos que estejam registrados em fotos. A seleção pode ser baixada em ZIP de até 200 MB por lote no navegador.

Ao desativar um álbum, novas autorizações de acesso são bloqueadas. Uma URL já assinada pode funcionar até expirar, por no máximo 60 segundos.

## URLs

- /cliente: página inicial vazia, sem fotos de demonstração.
- /cliente/<codigo>: álbum do cliente.
- /fotografo: login e painel.
- /: redireciona para /cliente.
- /g/<codigo>: compatibilidade com links anteriores.
- /api/health: confirma configuração e disponibilidade das tabelas auxiliares, sem expor credenciais.

Álbuns e fotos anteriores no Cloudflare não são migrados automaticamente. A implantação antiga continua separada; uma migração de conteúdo deve preservar os códigos dos álbuns.

## Desenvolvimento e testes

- pnpm install
- pnpm run dev:vercel
- pnpm run build:vercel
- pnpm run start:vercel
- pnpm run test:supabase

O teste de integração local simula o Supabase e verifica autenticação, isolamento entre fotógrafos, CSRF, uploads maiores que 4 MB, integridade dos arquivos, publicação e seleção. O build Next.js verifica os tipos e gera .next/routes-manifest.json.

## Implantação original no Sites

pnpm run build continua gerando o Worker Vinext/Cloudflare. O alias @lume-api seleciona lib/sites-api.ts nesse ambiente e lib/vercel-api.ts no Next.js. A variante Sites preserva o armazenamento D1/R2 e não compartilha dados nem sessões com o Supabase. Não use dados de produção no armazenamento de desenvolvimento.

## Salvar fotos no celular

A área do cliente identifica imagens por número, sem mostrar o nome original do arquivo. A marca e os detalhes decorativos usam SVG.

Em telas de celular, Salvar fotos prepara imagens individuais e oferece uma segunda ação que abre o menu nativo do aparelho via Web Share API. O usuário escolhe a opção de salvar no aplicativo de fotos. Isso depende das opções oferecidas pelo navegador e pelo sistema; o site não grava automaticamente na galeria. A segunda ação preserva a ativação exigida pelo navegador após o download dos arquivos.

Sem compartilhamento de arquivos disponível, a interface mostra as imagens para salvar pelo toque prolongado ou abrir individualmente. O lote móvel é limitado a 100 MB por vez. No computador, o download da seleção continua sendo ZIP de até 200 MB.

Use pnpm run test:downloads para verificar preparação, tipos, cancelamento e chamada nativa com os arquivos já preparados.
