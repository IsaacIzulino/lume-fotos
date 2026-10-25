-- Lume: complemento para o login por tabela e uploads diretos.
-- Execute inteiro no SQL Editor do MESMO projeto onde estão as tabelas.
-- Não altera usuários, senhas, álbuns ou fotos existentes.
begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.lume_sessoes (
  token_hash text primary key,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  expira_em timestamptz not null,
  criado_em timestamptz not null default now()
);
create index if not exists lume_sessoes_expira_idx on public.lume_sessoes(expira_em);

create table if not exists public.lume_login_tentativas (
  chave text primary key,
  tentativas integer not null default 0,
  inicio timestamptz not null default now()
);

create table if not exists public.lume_uploads (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albuns(id) on delete cascade,
  fotografo_id uuid not null references public.fotografos(id) on delete cascade,
  nome_arquivo text not null,
  caminho_storage text not null unique,
  tipo_mime text not null check (tipo_mime in ('image/jpeg','image/png','image/webp')),
  tamanho_bytes bigint not null check (tamanho_bytes between 1 and 26214400),
  expira_em timestamptz not null default (now() + interval '2 hours'),
  criado_em timestamptz not null default now()
);
create index if not exists lume_uploads_album_idx on public.lume_uploads(album_id);

alter table public.lume_sessoes enable row level security;
alter table public.lume_login_tentativas enable row level security;
alter table public.lume_uploads enable row level security;
revoke all on public.lume_sessoes, public.lume_login_tentativas, public.lume_uploads from anon, authenticated;
grant all on public.lume_sessoes, public.lume_login_tentativas, public.lume_uploads to service_role;
grant select, insert, update, delete on public.fotografos, public.usuarios, public.albuns, public.fotos, public.selecoes, public.selecao_fotos to service_role;

-- A senha é verificada no banco. O limite de tentativas é compartilhado
-- entre todas as instâncias da Vercel e não desaparece a cada deploy.
create or replace function public.lume_login(
  p_usuario text,
  p_senha text,
  p_chave_limite text,
  p_token_hash text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_usuario public.usuarios%rowtype;
  v_nome text := lower(btrim(p_usuario));
  v_chave text;
  v_limite integer;
  v_tentativas integer;
  v_bloqueado boolean := false;
  v_confere boolean;
begin
  if v_nome is null or char_length(v_nome) not between 3 and 80
     or p_senha is null or octet_length(p_senha) not between 1 and 72
     or p_token_hash !~ '^[a-f0-9]{64}$'
     or p_chave_limite !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('status','invalid');
  end if;

  foreach v_chave in array array[
    'ip:' || p_chave_limite,
    'usuario:' || encode(extensions.digest(v_nome,'sha256'),'hex')
  ] loop
    v_limite := case when v_chave like 'ip:%' then 30 else 10 end;
    insert into public.lume_login_tentativas(chave,tentativas,inicio)
      values(v_chave,1,now())
    on conflict(chave) do update set
      tentativas = case
        when lume_login_tentativas.inicio < now() - interval '15 minutes' then 1
        else lume_login_tentativas.tentativas + 1 end,
      inicio = case
        when lume_login_tentativas.inicio < now() - interval '15 minutes' then now()
        else lume_login_tentativas.inicio end
    returning tentativas into v_tentativas;
    if v_tentativas > v_limite then v_bloqueado := true; end if;
  end loop;

  if v_bloqueado then return jsonb_build_object('status','limited'); end if;

  select * into v_usuario from public.usuarios where usuario = v_nome;
  v_confere := extensions.crypt(
    p_senha,
    coalesce(v_usuario.senha_hash, extensions.gen_salt('bf',12))
  ) = v_usuario.senha_hash;

  if v_usuario.id is null or not v_usuario.ativo or v_confere is not true then
    return jsonb_build_object('status','invalid');
  end if;

  delete from public.lume_sessoes where expira_em < now();
  delete from public.lume_login_tentativas where inicio < now() - interval '1 day';
  delete from public.lume_login_tentativas
    where chave = 'usuario:' || encode(extensions.digest(v_nome,'sha256'),'hex');

  insert into public.lume_sessoes(token_hash,usuario_id,expira_em)
    values(p_token_hash,v_usuario.id,now() + interval '8 hours');

  return jsonb_build_object('status','ok','usuario',v_usuario.usuario);
end;
$$;

-- Grava a seleção e seus itens em uma única transação.
create or replace function public.lume_enviar_selecao(
  p_codigo text,
  p_nome text,
  p_fotos uuid[]
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_album uuid;
  v_selecao uuid := gen_random_uuid();
  v_ids uuid[];
  v_quantidade integer;
begin
  if p_nome is null or char_length(btrim(p_nome)) not between 1 and 120
     or coalesce(cardinality(p_fotos),0) not between 1 and 1000 then
    raise exception 'LUME_SELECAO_INVALIDA';
  end if;

  select id into v_album from public.albuns
    where codigo_publico = p_codigo and publicado = true
    for share;
  if v_album is null then raise exception 'LUME_GALERIA_INDISPONIVEL'; end if;

  select array_agg(distinct id) into v_ids from unnest(p_fotos) as t(id);
  select count(*) into v_quantidade from public.fotos
    where album_id = v_album and id = any(v_ids);
  if v_quantidade <> cardinality(v_ids) then
    raise exception 'LUME_SELECAO_INVALIDA';
  end if;

  insert into public.selecoes(id,album_id,nome_cliente)
    values(v_selecao,v_album,btrim(p_nome));
  insert into public.selecao_fotos(album_id,selecao_id,foto_id)
    select v_album,v_selecao,id from unnest(v_ids) as t(id);
  return v_selecao;
end;
$$;

revoke all on function public.lume_login(text,text,text,text) from public, anon, authenticated;
revoke all on function public.lume_enviar_selecao(text,text,uuid[]) from public, anon, authenticated;
grant execute on function public.lume_login(text,text,text,text) to service_role;
grant execute on function public.lume_enviar_selecao(text,text,uuid[]) to service_role;

-- O bucket criado anteriormente permanece privado.
update storage.buckets set
  public = false,
  file_size_limit = 26214400,
  allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'fotos';

notify pgrst, 'reload schema';
commit;
