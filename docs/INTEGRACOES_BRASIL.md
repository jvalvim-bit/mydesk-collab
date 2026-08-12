# Integrações brasileiras

O MyDesk centraliza consultas brasileiras no endpoint `GET /api/brasil`. Nenhuma
das integrações abaixo exige chave ou variável de ambiente.

## Provedores e uso

| Recurso | Provedor | Parâmetros |
|---|---|---|
| CEP | ViaCEP; BrasilAPI como fallback | `recurso=cep&cep=01001000` |
| CNPJ | BrasilAPI | `recurso=cnpj&cnpj=04252011000110` |
| Estados | IBGE Localidades | `recurso=estados` |
| Municípios | IBGE Localidades | `recurso=municipios&uf=SP` |
| Bancos | BrasilAPI | `recurso=bancos` |
| DDD | BrasilAPI | `recurso=ddd&ddd=11` |
| Feriados | BrasilAPI | `recurso=feriados&ano=2026` |

As respostas externas são normalizadas pela biblioteca
`lib/brazil-services.js`. O navegador não chama os provedores diretamente.

## Onde aparece

- **Clientes/CRM:** consulta opcional de CNPJ, busca de CEP e seletores de
  estado e município.
- **Construtor de formulários:** tipos `CEP inteligente`, `CNPJ inteligente`,
  `Estado (IBGE)` e `Município (IBGE)`.
- **Formulário público:** valida o documento/CEP, exibe uma confirmação da
  consulta e envia apenas o valor preenchido.

Os dados sugeridos continuam editáveis antes de salvar.

## Cache e resiliência

- CEP, estados e municípios: 30 dias.
- CNPJ: 24 horas.
- Bancos: 7 dias.
- DDD: 30 dias.
- Feriados: 1 ano.

Há cache na CDN da Vercel e no `localStorage` do navegador. Consultas simultâneas
iguais são deduplicadas. ViaCEP é o provedor principal de CEP; se não responder
ou não encontrar o endereço, a rota tenta BrasilAPI.

BrasilAPI é um serviço público comunitário e não oferece SLA. Por isso o MyDesk
exibe erros amigáveis, mantém os campos editáveis e não impede salvar um cliente
quando uma consulta externa estiver indisponível.
