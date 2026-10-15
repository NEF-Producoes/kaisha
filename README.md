# Kaisha 会社

**Um escritório em pixel art que mostra seus agentes de IA trabalhando, ao vivo.**
Self-hosted, um container só, sobe no EasyPanel em cinco minutos. Licença MIT.

![Escritório do Kaisha](docs/escritorio.png)

Cada agente tem uma mesa. Quando ele começa uma tarefa, o boneco digita, o monitor acende e um balão mostra o que está fazendo; esperando, aparece em amarelo; com erro, o monitor fica vermelho. Clique num agente para ver o histórico.

- **Funciona com qualquer coisa** que faça uma chamada HTTP: n8n, scripts, cron, Claude Code, OpenClaw, seu backend.
- **Escritório em um arquivo** (`office.yaml`): salas, mesas, móveis. Salvou, o painel muda na hora, sem recarregar a página.
- **Decoração por data**: Natal, Festa Junina e outras datas mudam o escritório sozinhas. Temas novos são uma pasta com um arquivo de texto.
- **Leve**: Node.js 22, SQLite embutido, sem Redis, sem banco externo. Um volume para os dados.

## Subindo no EasyPanel

1. **Crie o app**: em um projeto, *+ Serviço → App*. Em *Fonte*, escolha **Imagem Docker** e use `ghcr.io/nef-producoes/kaisha:latest`.
   (Ou escolha **GitHub**, aponte para este repositório e deixe o *Dockerfile* como método de build.)
2. **Volume**: em *Montagens*, adicione um **Volume** com caminho de montagem `/data`.
3. **Ambiente**:
   ```env
   KAISHA_API_KEY=um-token-longo-e-aleatorio
   # VIEW_PASSWORD=senha-para-ver-o-painel   (opcional)
   TZ=America/Sao_Paulo
   # KAISHA_EXAMPLE=musashi   (opcional: qual exemplo de examples/ vira o primeiro office.yaml)
   ```
4. **Domínio**: em *Domínios*, aponte o seu domínio para a **porta 3000** com HTTPS.
5. **Implante** e abra o domínio. No primeiro acesso o Kaisha cria um `office.yaml` de exemplo dentro do volume.

**Editar pela tela:** clique em **✎ Editar** no topo do painel e informe a chave da API (`KAISHA_API_KEY`), que fica guardada só no navegador. Dá para renomear o escritório e os agentes, trocar cores, tema e planta, criar e ajustar salas, arrastar mesas e móveis no mapa e colocar móveis novos. **Salvar** grava o `office.yaml` (o anterior fica em `office.yaml.bak`) e todo mundo que estiver com o painel aberto vê na hora.

Também dá para editar o escritório abrindo o `office.yaml` do volume (pelo *Console* do EasyPanel ou pelo gerenciador de arquivos) e salve. O painel atualiza sozinho.

### Sem EasyPanel

```bash
docker run -d --name kaisha -p 3000:3000 -v kaisha-data:/data \
  -e KAISHA_API_KEY=um-token-longo ghcr.io/nef-producoes/kaisha:latest
```
ou `docker compose up -d` com o [`docker-compose.yml`](docker-compose.yml).

## Mandando status

```bash
curl -X POST https://kaisha.seudominio.com/api/events \
  -H "apikey: $KAISHA_API_KEY" -H "content-type: application/json" \
  -d '{"agent":"atendimento","status":"working","task":"Respondendo a Maria","queue":3}'
```

| Campo | Obrigatório | O que é |
| --- | --- | --- |
| `agent` | sim | id do agente (o mesmo do `office.yaml`) |
| `status` | sim | `working`, `waiting`, `idle`, `error` ou `offline` |
| `task` | não | texto curto mostrado no balão |
| `queue` | não | itens na fila ("3 na fila") |
| `progress` | não | barra de progresso de 0 a 1 |
| `ttl` | não | segundos até o agente voltar sozinho para `idle` (bom para tarefas curtas: uma chamada só) |
| `outcome` | não | resultado da tarefa: `success` (o agente pula e solta confete), `question` (levanta a mão com um "?") ou `error` (nuvem com raios). Também aceita `sucesso`, `pergunta` e `erro` |
| `meta` | não | objeto livre, aparece no histórico |
| `andar` | não | em qual andar (escritório) o agente está; veja [Andares](#andares-várias-empresas-no-mesmo-kaisha) |

A autenticação é o header `apikey`, no mesmo padrão da Evolution API. Um agente que não está no `office.yaml` aparece na sala **Sem mesa**. Sem sinal por 15 minutos (`OFFLINE_AFTER`), o agente vira *offline* sozinho; em tarefas longas, mande `POST /api/heartbeat`.

Mais exemplos em [`examples/curl.md`](examples/curl.md). Para o n8n há um subworkflow pronto em [`examples/n8n`](examples/n8n).

## O escritório (`office.yaml`)

```yaml
nome: Minha Empresa
tema: auto              # auto (pelo calendário), natal, junina… ou nenhum
salas:
  - id: atendimento
    nome: Atendimento
    area: [0, 0, 11, 9]   # coluna, linha, largura, altura (blocos de 16 px)
    piso: madeira         # madeira, carpete_azul, carpete_verde, ladrilho, xadrez
agentes:
  - id: atendimento
    nome: Aura
    cargo: Atendimento
    sala: atendimento
    mesa: [2, 3]
    cor: laranja
moveis:
  - { tipo: planta, pos: [10, 7] }
datas_especiais:
  - { data: "03-15", nome: "Aniversário da empresa", mensagem: "Parabéns, equipe!" }
```

As chaves podem ser em português ou inglês (`salas`/`rooms`, `agentes`/`agents`…). Um arquivo com erro não derruba nada: o escritório anterior continua e o erro aparece num aviso na tela. Exemplo completo e comentado em [`examples/office.yaml`](examples/office.yaml).

**Ficar na mesa ou na sala**: `fica_na_mesa: true` deixa o agente sempre sentado (como o central, mas sem distribuir tarefas); `fica_na_sala: true` faz ele passear só dentro da própria sala. `penteado: longo` (ou `curto`) escolhe o cabelo do boneco.

**Planta aberta** (`planta: aberta`): em vez de salas fechadas, o escritório vira um salão só. Só as áreas encostadas no fundo têm parede; entre as outras entram divisórias baixas com uma passagem no meio de cada divisa. Veja [`examples/musashi.yaml`](examples/musashi.yaml).

**Vida no escritório**: agente livre não fica parado na cadeira. Ele circula pelo escritório e passa no café, no bebedouro e no sofá. Quando chega uma tarefa, o celular dele toca, ele corre até a mesa e senta para trabalhar. Um agente com `central: true` fica sempre na mesa; as tarefas saem dele, num envelope, até quem vai fazer (bom para um orquestrador, como uma recepção).

**Vontades**: cada agente tem sede, vontade de ir ao banheiro, de bater papo, de se divertir e cansaço, que sobem com o tempo (a sede sobe mais rápido trabalhando; o cansaço só sobe trabalhando). Livre, ele atende a mais urgente: toma água no `bebedouro` ou café no `cafe` (café também tira o cansaço), vai ao `banheiro` (some lá dentro e a luz da porta fica vermelha), puxa conversa com outro agente livre (os dois trocam balões com emoji), mexe no celular no `sofa`, lê um livro na `estante` ou cochila no sofá quando está muito cansado. Cada lugar é de um por vez (cada assento do sofá conta separado); os sofás da sala de espera ficam para as visitas. Chegou tarefa, ele larga tudo e corre para a mesa. Quem tem `fica_na_mesa` ou `central` não sai da mesa, e `fica_na_sala` só usa o que está na própria sala. Clique no agente para ver as barras de vontade e o que ele está fazendo. Para testar, abra o painel com `?pressa` no endereço: as vontades sobem 20 vezes mais rápido.

**Resultado das tarefas**: mande `outcome` no fim da tarefa. Sucesso vira pulinhos, confete e sede (ele vai tomar um café ou uma água); pergunta deixa a mão levantada com "?" (use com `status: waiting`); erro põe uma nuvem com raios na cabeça (use com `status: error`) e o agente com `inspetor: true` vai até a mesa investigar. O placar do dia (✓ ? ⛈) aparece no quadro da parede e zera à meia-noite.

## Visitas (pacientes, clientes)

Um andar pode receber visitas com hora marcada, como os pacientes de um consultório. Basta ter uma sala com `tipo: espera` (ou a opção **Sala de espera** no editor) e mandar a lista do dia:

```bash
curl -X POST https://kaisha.seudominio.com/api/visits \
  -H "apikey: $KAISHA_API_KEY" -H "content-type: application/json" \
  -d '{"andar":"consultorio","dia":"2026-10-14","visitas":[
        {"id":"evt123","nome":"A.R.C.","inicio":"2026-10-14T09:30:00-03:00","fim":"2026-10-14T10:15:00-03:00","agente":"dra_erika"},
        {"id":"evt456","nome":"P.F.F.","inicio":"2026-10-14T10:30:00-03:00","fim":"2026-10-14T11:15:00-03:00","agente":"dra_erika","online":true}]}'
```

- A lista substitui a do dia inteiro, então dá para reenviar sempre que a agenda mudar (uma consulta desmarcada some da tela).
- A próxima visita presencial já fica esperando na sala de espera, mesmo que falte mais tempo; as outras chegam 15 minutos antes. Cada uma senta no sofá. No horário marcado, o `agente` vai até a sala de espera chamar a visita e os dois vão juntos para a sala dele; a visita fica na frente da mesa até o `fim` e depois sai pela porta.
- Durante a visita o agente fica *executando* ("Atendendo A.R.C."). No fim, volta livre e conta um ✓ no placar. O próprio Kaisha faz isso no horário; ninguém precisa mandar status.
- Com `online: true` a visita não entra no escritório: aparece uma janela de vídeo na mesa do agente com a etiqueta "💻 … · online", e o agente fica em "Teleconsulta · …".
- O painel pode ser aberto por outras pessoas: use um nome curto, como as iniciais, e nunca mande dado sensível.

## Andares (várias empresas no mesmo Kaisha)

Cada andar é um escritório separado, com planta, agentes, placar do dia e chave próprios. Quando há mais de um, aparecem abas no topo do painel (`?andar=nef` abre direto um andar).

- O andar principal é o `/data/office.yaml` (id `principal`, ou o de `KAISHA_ANDAR_PRINCIPAL`).
- Os outros são arquivos em `/data/andares/<id>.yaml`, no mesmo formato. Dá para criar copiando um arquivo para lá, pelo botão **Novo andar** do editor (com a chave geral) ou com `KAISHA_ANDARES=nef,consultorio`, que cria os andares que faltam a partir de [`examples/andares`](examples/andares). Nesse caso, os agentes do exemplo que estavam no andar principal mudam de andar junto com o histórico.
- `ordem: 1` no arquivo define a posição da aba.

**Em qual andar cai um status**: o campo `andar` (ou `?andar=` no endereço) manda. Sem ele, vale o andar da chave; depois, o andar onde o agente está declarado (o principal primeiro); por fim, o principal. Assim, mover um agente de andar no YAML basta: os fluxos não precisam mudar. O mesmo id pode existir em andares diferentes (cada empresa com o seu `caixa`); nesse caso, mande o `andar`.

**Chaves por andar**: `KAISHA_API_KEY` vale para todos. `KAISHA_API_KEY_NEF` só escreve no andar `nef` (o id em maiúsculas, com `-` virando `_`). Use uma chave por empresa: quem tem a chave da NEF não mexe no escritório do consultório.

**Móveis**: `estante`, `planta`, `relogio`, `janela`, `quadro` (kanban), `grafico`, `bebedouro`, `arquivo`, `sofa`, `mesa_reuniao`, `impressora`, `tapete`, `cafe`, `banheiro`.
**Cores dos bonecos**: `vermelho`, `laranja`, `amarelo`, `verde`, `azul`, `roxo`, `rosa`, `cinza`, `preto`, `branco`.

## Temas por data

| Tema | Período | | |
| --- | --- | --- | --- |
| Natal | 1 a 26 de dezembro | ![Natal](docs/tema-natal.png) | luzinhas, guirlandas, árvore, presentes, gorro e neve |
| Festa Junina | 1º de junho a 31 de julho | ![Junina](docs/tema-junina.png) | bandeirinhas, lanternas, fogueira, milho e chapéu de palha |

Datas móveis (Carnaval, Páscoa, Black Friday) são calculadas a cada ano. Para criar um tema, veja o [CONTRIBUTING](CONTRIBUTING.md): é uma pasta com um `theme.yaml`, e os desenhos são texto. Temas próprios podem ficar em `/data/themes/` sem mexer na imagem.

## Variáveis de ambiente

| Variável | Padrão | O que faz |
| --- | --- | --- |
| `KAISHA_API_KEY` | (obrigatória) | token dos agentes, enviado no header `apikey` |
| `KAISHA_API_KEY_HEADER` | `apikey` | nome do header, se quiser outro |
| `VIEW_PASSWORD` | vazio | senha para ver o painel; vazio = aberto |
| `OFFLINE_AFTER` | `15m` | tempo sem sinal até virar offline |
| `HISTORY_DAYS` | `30` | dias de histórico guardados |
| `TZ` | `America/Sao_Paulo` | fuso dos temas e horários |
| `KAISHA_LANG` | `pt-BR` | idioma da interface (`pt-BR` ou `en`) |
| `KAISHA_ANDARES` | vazio | andares para criar a partir de `examples/andares` (ex.: `nef,consultorio`) |
| `KAISHA_API_KEY_<ANDAR>` | vazio | chave que só escreve naquele andar (ex.: `KAISHA_API_KEY_NEF`) |
| `KAISHA_ANDAR_PRINCIPAL` | `principal` | id do andar do `office.yaml` |
| `PORT` | `3000` | porta HTTP |

**Segurança**: o painel mostra as tarefas dos agentes, que podem conter nomes de clientes. Se o domínio for público, use `VIEW_PASSWORD` ou um proxy com login (Cloudflare Access, por exemplo). A `apikey` só permite escrever status.

## API

| Rota | Acesso | |
| --- | --- | --- |
| `POST /api/events` | apikey | um evento, uma lista, ou `{ "events": [...] }` (até 100); `andar` opcional |
| `POST /api/heartbeat` | apikey | `{ "agent": "id" }` ou `{ "agents": [...] }` |
| `DELETE /api/agents/:id` | apikey | tira o agente do escritório |
| `POST /api/reload` | apikey | força a releitura do `office.yaml` |
| `POST /api/visits` | apikey | visitas do dia de um andar (`dia`, `visitas`, `andar`) |
| `PUT /api/office?andar=` | apikey | grava o escritório do andar (cria o andar, com a chave geral) |
| `GET /api/floors` | painel | lista de andares |
| `GET /api/state` | painel | estado de todos os agentes + escritório + tema (`?andar=`) |
| `GET /api/agents/:id/history` | painel | últimos eventos (`?limit=50`) |
| `GET /api/stream` | painel | atualizações ao vivo (Server-Sent Events) |
| `GET /healthz` | livre | verificação de saúde |

## Desenvolvimento

```bash
npm install
npm run dev     # http://localhost:3000, dados em ./data, apikey "dev"
```

Sem build: o servidor é Node puro e a página é JavaScript em módulos. Os desenhos são feitos em código ([`web/sprites.js`](web/sprites.js)) e nos temas.

## Licença

[MIT](LICENSE). Código e desenhos podem ser usados, modificados e vendidos à vontade.

---

*Kaisha (会社) é "empresa" em japonês. Feito pela [NEF Produções](https://nefproducoes.com.br).* · [English](README.en.md)
