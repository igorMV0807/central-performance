# Implantação isolada

Este guia descreve uma instalação nova para demonstração. Ele não contém nem modifica a infraestrutura de produção.

## Componentes

1. Um projeto Supabase novo para autenticação e PostgreSQL.
2. Uma instância n8n isolada para os workflows.
3. Um provedor de e-mail configurado com domínio de teste.
4. O aplicativo Next.js publicado na Vercel ou executado localmente.
5. A coleção do Postman apontando apenas para os webhooks de teste.

## Sequência

1. Crie o banco isolado e transforme os snapshots SQL em migrações revisadas.
2. Crie usuários de teste e mantenha RLS bloqueando o acesso direto.
3. Importe e religue os workflows n8n.
4. Configure segredos somente nos painéis privados dos serviços.
5. Gere eventos sintéticos e execute os 24 cenários da coleção.
6. Configure o dashboard com as chaves do projeto isolado.
7. Faça uma revisão final seguindo `PUBLICATION_CHECKLIST.md`.

Não reutilize contas, chaves, webhooks, domínios ou dados da operação real.
