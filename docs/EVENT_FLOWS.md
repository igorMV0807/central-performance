# Fluxos do sistema

## Hotmart

```mermaid
flowchart LR
  A[Evento Hotmart] --> B[Webhook central]
  B --> C[Validação e idempotência]
  C --> D[(hotmart_events)]
  D --> E[Processador de eventos]
  E --> F[(purchase_journeys)]
  F --> G[Motor de recuperação]
  G --> H[Entrega de e-mail]
  H --> I[Cliques, bounces e conversões]
  I --> J[Central de Performance]
```

## PerfectPay

```mermaid
flowchart LR
  A[Evento PerfectPay] --> B[Webhook e jornadas]
  B --> C[(perfectpay_events)]
  C --> D[(perfectpay_journeys)]
  D --> E[Motor de recuperação]
  E --> F[Entrega e rastreamento]
  F --> G[Cliques e conversões]
  G --> H[Central de Performance]
```

## Laboratório de copy

```mermaid
flowchart LR
  A[Oferta e materiais] --> B[Análise assistida por IA]
  B --> C[Rascunho de copy]
  C --> D[Revisão humana]
  D --> E[Experimento controlado]
  E --> F[Métricas e avaliação]
  F --> G[Decisão de manter, pausar ou promover]
```

O laboratório mantém revisão humana antes de qualquer promoção. O dashboard consolida as métricas; as automações executam o trabalho operacional; o PostgreSQL preserva o histórico e a rastreabilidade.
