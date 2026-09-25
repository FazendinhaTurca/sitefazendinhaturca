create table if not exists public.blog_faqs (
  id uuid primary key default gen_random_uuid(),
  artigo_id uuid not null references public.blog_artigos(id) on delete cascade,
  pergunta text not null,
  resposta text not null,
  ordem integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_blog_faqs_artigo_ordem on public.blog_faqs (artigo_id, ordem);

alter table public.blog_faqs enable row level security;
grant select on public.blog_faqs to anon, authenticated;

create policy "publico_le_faqs_ativos" on public.blog_faqs
for select to anon, authenticated using (ativo = true);

create policy "admin_full_blog_faqs" on public.blog_faqs
for all to authenticated
using ((select auth.uid()) = 'f478b18e-073d-4c95-ae58-2e046fd0d04a'::uuid)
with check ((select auth.uid()) = 'f478b18e-073d-4c95-ae58-2e046fd0d04a'::uuid);
