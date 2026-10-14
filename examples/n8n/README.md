# Kaisha no n8n

`kaisha-reportar.json` é um subworkflow pronto. Importe no n8n (Workflows → Import from File) e:

1. Crie uma credencial **Header Auth** com nome do header `apikey` e o valor do seu `KAISHA_API_KEY`.
2. Abra o nó **Enviar ao Kaisha**, escolha essa credencial e troque a URL pelo endereço do seu Kaisha.
3. Publique o workflow.

Nos seus workflows, use um nó **Execute Workflow** apontando para ele, com os campos:

| Campo | Exemplo |
| --- | --- |
| `agent` | `transcricao` |
| `status` | `working` no começo, `idle` no fim, `error` no fluxo de erro |
| `task` | `Áudio da Dra. Juliana` |
| `queue` | `2` (opcional) |

Dica: desmarque "Wait For Sub-Workflow Completion" para não atrasar o seu fluxo. O nó de envio já está com "Continue on Fail": se o Kaisha cair, seus workflows continuam rodando.
