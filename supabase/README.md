# Supabase / PostgreSQL

Snapshot estrutural e sanitizado do backend. Nenhuma linha de produção, credencial, chave, URL privada ou identificador de projeto está incluído.

## Arquivos

- `schema-public.sql`: 22 tabelas, constraints e RLS habilitado;
- `indexes.sql`: índices secundários;
- `views.sql`: views usadas pelas métricas;
- `functions.sql`: funções PostgreSQL e revogação explícita de execução pública;
- `triggers.sql`: gatilhos que mantêm eventos, jornadas e métricas consistentes.

## Ordem sugerida em um projeto vazio

1. `schema-public.sql`
2. `indexes.sql`
3. `views.sql`
4. `functions.sql`
5. `triggers.sql`

Este é um snapshot de referência, não uma migração pronta para produção. Revise as dependências e aplique em um projeto Supabase isolado usando migrações versionadas.

## Segurança

- RLS permanece habilitado em todas as tabelas.
- Nenhuma política permissiva é publicada; por padrão, o cliente não acessa dados.
- A service-role key é usada somente no servidor.
- Funções públicas têm `EXECUTE` revogado de `PUBLIC`; conceda acesso apenas a papéis específicos após auditoria.
- Nunca reutilize chaves ou senhas do ambiente real.
