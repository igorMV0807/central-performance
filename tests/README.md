# Testes de API

A coleção `postman/hotmart-e2e.postman_collection.json` contém 24 cenários sanitizados para validar a entrada e o processamento dos eventos Hotmart.

## Uso seguro

1. Importe a coleção no Postman.
2. Defina `webhook_url` com a URL do ambiente de teste.
3. Defina `hottok` com um token exclusivo de teste.
4. Use apenas compradores, transações e produtos fictícios.
5. Rode a coleção e confirme as asserções antes de ativar as automações.

A coleção da PerfectPay não estava disponível entre os artefatos encontrados e, por isso, não foi inventada nem incluída.
