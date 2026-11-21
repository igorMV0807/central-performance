# Central de Performance

[Português](#português) · [English](#english)

## Português

Um sistema completo de recuperação de receita e observabilidade operacional: webhooks, automações, PostgreSQL, testes E2E e uma central privada para acompanhar jornadas, e-mails, eventos, alertas e experimentos.

O projeto transforma dados dispersos de automações comerciais em uma interface que ajuda a responder perguntas práticas:

- quanto foi recuperado e por qual fluxo;
- quais jornadas ainda precisam de atenção;
- onde os e-mails ou links de checkout apresentam problemas;
- como cada etapa do funil está performando;
- quais eventos deram origem a uma conversão.

### Principais recursos

- visão geral com indicadores e séries temporais;
- filtros por período e fluxo de recuperação;
- análises separadas para Hotmart e PerfectPay;
- acompanhamento de jornadas e eventos;
- central de alertas operacionais;
- laboratório para comparar variações de copy;
- autenticação e lista de usuários autorizados;
- cálculos executados no servidor com cache de curta duração.

### O que existe neste repositório

| Parte | Conteúdo |
|---|---|
| `app/`, `components/`, `lib/` | dashboard Next.js, autenticação e métricas no servidor |
| `automations/hotmart/` | 5 workflows n8n da jornada Hotmart |
| `automations/perfectpay/` | 4 workflows n8n da jornada PerfectPay |
| `automations/laboratory/` | 3 workflows do laboratório de copy e experimentos |
| `supabase/` | 22 tabelas, 43 funções, 16 gatilhos, views e índices |
| `tests/postman/` | coleção E2E Hotmart com 24 cenários |

Os artefatos de backend são snapshots públicos sanitizados: preservam a lógica e a arquitetura, mas não carregam credenciais, dados reais, URLs de produção ou associações internas.

### Arquitetura

```mermaid
flowchart LR
  A[Eventos de pagamento] --> B[Automações e webhooks]
  B --> C[(Supabase / PostgreSQL)]
  C --> D[Next.js Server Components]
  D --> E[Regras de métricas e atribuição]
  E --> F[Central de Performance]
  G[Supabase Auth] --> F
  F --> H[Visão geral]
  F --> I[E-mails e funis]
  F --> J[Jornadas e eventos]
  F --> K[Alertas e laboratório]
```

Mais detalhes: [arquitetura](docs/ARCHITECTURE.md), [fluxos de eventos](docs/EVENT_FLOWS.md) e [implantação isolada](docs/DEPLOYMENT.md).

### Tecnologias

Next.js 16, React 19, TypeScript, Tailwind CSS, Supabase Auth, PostgreSQL, Recharts e Lucide.

### Executar localmente

> Use somente um projeto Supabase isolado com dados sintéticos. Não conecte esta cópia pública ao banco de produção.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Preencha as variáveis descritas em `.env.example`. A chave `SUPABASE_SERVICE_ROLE_KEY` deve permanecer exclusivamente no servidor e nunca pode receber o prefixo `NEXT_PUBLIC_`.

### Segurança e privacidade

Esta versão pública não contém credenciais, arquivos `.env.local`, dados de clientes, mídia real, artefatos de build ou dependências instaladas. Antes de publicar uma alteração, siga [docs/PUBLICATION_CHECKLIST.md](docs/PUBLICATION_CHECKLIST.md).

### Contexto de portfólio

Este repositório apresenta o sistema completo em versão segura para portfólio. Dados e resultados exibidos em demos devem ser sintéticos. Veja o [case do projeto](docs/PORTFOLIO_CASE.md) e o [roteiro de demonstração](docs/DEMO_SCRIPT.md).

---

## English

Central de Performance is an end-to-end revenue-recovery and operations-observability system. It includes webhook ingestion, n8n automation, PostgreSQL business logic, E2E API tests, and a private dashboard for journeys, email performance, payment events, alerts, and experiments.

It turns fragmented automation data into an interface that helps operators understand recovered revenue, active journeys, checkout issues, funnel performance, and conversion context.

### Highlights

- overview metrics and time-series charts;
- period and recovery-flow filters;
- separate Hotmart and PerfectPay analytics;
- journey and event traceability;
- operational alerts;
- copy-testing laboratory;
- authenticated, allowlisted access;
- server-side calculations with short-lived caching.

### Stack

Next.js 16, React 19, TypeScript, Tailwind CSS, Supabase Auth, PostgreSQL, Recharts, and Lucide.

### Local development

Use an isolated Supabase project with synthetic data only. Copy `.env.example` to `.env.local`, install dependencies, and run `npm run dev`. Never expose the service-role key to the browser.

This public portfolio copy intentionally excludes secrets, customer data, production media, build artifacts, and installed dependencies.

### Repository scope

- 12 sanitized n8n workflows for Hotmart, PerfectPay, and the copy laboratory;
- a structure-only Supabase/PostgreSQL snapshot with 22 tables, 43 functions, and 16 triggers;
- 24 sanitized Hotmart E2E scenarios for Postman;
- the complete authenticated Next.js operations dashboard.

Use [the isolated deployment guide](docs/DEPLOYMENT.md) to understand how the pieces fit together. The exported backend files are reference snapshots and require security review before use in a new environment.

## License

MIT — see [LICENSE](LICENSE).
