# Mandando status de qualquer lugar

Toda chamada de escrita leva o header `apikey` com o valor de `KAISHA_API_KEY`.

```bash
KAISHA=https://kaisha.seudominio.com
KEY=seu-token

# começou a trabalhar
curl -X POST "$KAISHA/api/events" -H "apikey: $KEY" -H "content-type: application/json" \
  -d '{"agent":"relatorios","status":"working","task":"Relatório de vendas de outubro","queue":2}'

# terminou
curl -X POST "$KAISHA/api/events" -H "apikey: $KEY" -H "content-type: application/json" \
  -d '{"agent":"relatorios","status":"idle"}'

# vários de uma vez (até 100)
curl -X POST "$KAISHA/api/events" -H "apikey: $KEY" -H "content-type: application/json" \
  -d '[{"agent":"a","status":"working"},{"agent":"b","status":"waiting","task":"Esperando aprovação"}]'

# "estou vivo" sem mudar o status (evita virar offline em tarefas longas)
curl -X POST "$KAISHA/api/heartbeat" -H "apikey: $KEY" -H "content-type: application/json" -d '{"agent":"relatorios"}'

# tirar um agente do escritório
curl -X DELETE "$KAISHA/api/agents/relatorios" -H "apikey: $KEY"
```

Status aceitos: `working`, `waiting`, `idle`, `error`, `offline`.

Campos opcionais: `task` (até 200 caracteres), `queue` (número), `progress` (0 a 1), `meta` (objeto livre, até 4 KB).

As chaves também podem ir em português: `agente`, `tarefa`, `fila`, `progresso`.
