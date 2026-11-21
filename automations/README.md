# Automações n8n

Exportação pública e sanitizada dos workflows que sustentam a Central de Performance. As credenciais, URLs, IDs internos, dados reais e associações com a instância de produção foram removidos. Todos os workflows estão desativados por segurança.

## Conteúdo

- `hotmart/`: entrada do webhook, processamento, recuperação, entrega e bounces;
- `perfectpay/`: entrada e jornadas, recuperação, cliques e entrega;
- `laboratory/`: análise de oferta, geração de rascunhos e avaliação de experimentos.

## Como importar

1. Crie uma instância n8n isolada.
2. Importe os JSONs na ordem numérica de cada pasta.
3. Configure credenciais novas de Supabase, e-mail e APIs externas.
4. Religue manualmente os nós que chamam outro workflow. Os IDs originais foram substituídos por nomes simbólicos.
5. Configure `HOTMART_HOTTOK` e `PERFECTPAY_WEBHOOK_TOKEN` como segredos do ambiente.
6. Use somente dados sintéticos e URLs de teste.
7. Execute os testes antes de ativar qualquer workflow.

> Estes arquivos documentam a arquitetura. Eles não devem ser conectados ao ambiente de produção sem revisão independente de segurança.
