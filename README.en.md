# Kaisha 会社

**A pixel-art office that shows your AI agents at work, live.**
Self-hosted, a single container, deploys on EasyPanel in five minutes. MIT licensed.

![Kaisha office](docs/escritorio.png)

Every agent gets a desk. When it starts a task the character types, the monitor lights up and a bubble shows what it is doing; waiting shows in yellow; an error turns the monitor red. Click an agent to see its history.

- **Works with anything** that can make an HTTP call: n8n, scripts, cron, Claude Code, OpenClaw, your backend.
- **The office is one file** (`office.yaml`): rooms, desks, furniture. Save it and every open browser redraws instantly.
- **Seasonal decoration**: Christmas, Festa Junina, Halloween and other dates change the office on their own. A new theme is a folder with a text file.
- **Pixel art with light and shadow**: one palette, colored outlines, floor shadows and daylight coming through the windows. Click an agent to see its portrait card with a neon initial, generated from the agent's own colors, no external images.
- **Light**: Node.js 22, built-in SQLite, no Redis, no external database. One volume for data.

## Deploy on EasyPanel

1. **App**: *+ Service → App*, source **Docker Image** `ghcr.io/nef-producoes/kaisha:latest` (or **GitHub** with this repo and the *Dockerfile* build).
2. **Volume**: mount a volume at `/data`.
3. **Environment**: `KAISHA_API_KEY=a-long-random-token` (optional `VIEW_PASSWORD`, `TZ`, `KAISHA_LANG=en`, `KAISHA_EXAMPLE` to pick which file in `examples/` seeds the first office.yaml).
4. **Domain**: point it to **port 3000** with HTTPS.
5. **Deploy**. On first start Kaisha writes an example `office.yaml` into the volume.

Plain Docker: `docker run -d -p 3000:3000 -v kaisha-data:/data -e KAISHA_API_KEY=... ghcr.io/nef-producoes/kaisha:latest`

## Sending status

```bash
curl -X POST https://kaisha.example.com/api/events \
  -H "apikey: $KAISHA_API_KEY" -H "content-type: application/json" \
  -d '{"agent":"support","status":"working","task":"Answering Maria","queue":3}'
```

`status` is one of `working`, `waiting`, `idle`, `error`, `offline`. Optional: `task`, `queue`, `progress` (0–1), `meta`, `ttl` (seconds until the agent goes back to `idle` on its own, so short tasks need a single call), `outcome` (`success`: the agent jumps and throws confetti; `question`: raises a hand with a "?"; `error`: a storm cloud over the head, and the agent marked `inspector: true` walks over to check). A daily scoreboard shows on the wall board. Authentication is the `apikey` header (same style as Evolution API). Agents not listed in `office.yaml` show up in a **No desk** room. After 15 minutes without a signal (`OFFLINE_AFTER`) an agent goes offline; use `POST /api/heartbeat` for long tasks.

Config keys work in English or Portuguese (`rooms`/`salas`, `agents`/`agentes`, `desk`/`mesa`, `furniture`/`moveis`…). See [`examples/office.yaml`](examples/office.yaml), [`examples/curl.md`](examples/curl.md) and the ready-made n8n sub-workflow in [`examples/n8n`](examples/n8n). The full option list (env vars, furniture, API routes) is in the [Portuguese README](README.md#variáveis-de-ambiente).

**Open plan** (`plan: open`): one big floor instead of closed rooms. Only areas touching the back wall get a wall; the others are split by low partitions with a doorway in the middle of each shared edge. See `examples/musashi.yaml`.

**Office life**: idle agents walk around the office (coffee machine, water cooler, couch). When a task arrives their phone rings, they run to their desk and sit down to work. An agent with `central: true` always stays at the desk and tasks fly from it to whoever picks them up, which suits an orchestrator. The `central` agent also gets a wider command desk with 3 monitors; any agent can set `monitores: 2` or `3` (or `monitores: 1` to keep the regular desk). The role (`cargo`) is always shown under each agent's name.

**Needs**: every agent gets thirsty, needs the bathroom, wants to chat, wants some fun and gets tired over time. When idle they handle the most urgent one: water at the `bebedouro` or coffee at the `cafe`, the `banheiro` (bathroom: they disappear inside and the door light turns red), a chat with another idle agent (emoji speech bubbles), the phone on the `sofa`, a book at the `estante`, a nap on the couch, or a game: `sinuca` (pool), `pebolim` (foosball, needs two players) or `videogame` (pong on the TV). They invite another idle agent to play; the winner shows 🏆 and today's wins appear in the agent panel. Each spot takes one agent at a time. A real task always wins: they drop everything and run to the desk. Click an agent to see their need bars. Add `?pressa` to the URL to speed needs up 20x.

**Screen shape**: by default (`formato: auto`) the building sits in the middle of a lot with sidewalk, grass, trees and street lamps (lit at night), and the lot follows the screen ratio: it stretches sideways on ultrawide monitors and up and down on a phone held upright, with no empty bars. Use `formato: "16:9"` (or `"4:3"`, `"21:9"`…) to lock a ratio, or `formato: livre` to show only the building.

**Phones, tablets and big monitors**: on phones the map opens at 2x so names stay readable; drag with one finger and pinch to zoom. On desktop, Ctrl + mouse wheel or the − + ⤢ buttons in the corner. On phones the agent panel and the editor slide up from the bottom.

**Clock**: outside office hours (`expediente: "seg-sex 08:00-18:00"` by default) the lights dim and idle agents go home (🏠); an agent with a night task shows up at the desk with the monitor lit. At lunch (`almoco`, default 12:00-13:00) half go out and half eat at the meeting table; Friday happy hour (`happy_hour`, default `sex 16:30-18:00`) gathers everyone. Turn it off with `relogio: não`. Test other times with `?hora=22:00&dia=sex`.

**Reactions**: `POST /api/reactions` with `{ "andar": "nef", "agente": "caixa", "reacao": "festa" }` makes everyone idle clap 👏; `preocupado` (worried, 10 min sweat drop) and `alivio` (relief) too. Errors make nearby idle agents look over 😮, and when the `central` agent gets a task, agents playing sometimes hurry back to their desks pretending to work.

**Edit from the screen**: click **✎ Edit** at the top, enter the API key (`KAISHA_API_KEY`, kept only in your browser) and rename the office and agents, change colors, theme and plan, add and resize rooms, drag desks and furniture on the map and place new furniture. **Save** writes `office.yaml` (the previous one is kept as `office.yaml.bak`) and every open dashboard updates right away.

**Floors** (several companies in one Kaisha): each floor is a separate office with its own plan, agents, daily scoreboard and key, shown as tabs at the top (`?andar=<id>`). The main floor is `/data/office.yaml`; the others are `/data/andares/<id>.yaml`. Create them by dropping a file there, with **New floor** in the editor (main key) or with `KAISHA_ANDARES=nef,clinic`, which copies `examples/andares/<id>.yaml` and moves those agents out of the main floor. An event goes to the floor in its `andar` field, else the key's floor, else the floor where the agent is declared, else the main one. `KAISHA_API_KEY` writes to every floor; `KAISHA_API_KEY_NEF` only to floor `nef`.

**Visits** (patients, customers): give a room `type: waiting` and `POST /api/visits` with `{ andar, dia, visitas: [{ id, nome, inicio, fim, agente, online }] }` (replaces the whole day). Visitors arrive 15 minutes early, sit in the waiting room, walk to the agent's desk at the start time and leave at the end; the agent shows as working during the visit and scores a ✓ when it ends. `online: true` visits only keep the agent busy. Send short names (initials): the dashboard may be seen by others.

## Themes

Themes live in `themes/<id>/theme.yaml` (or `/data/themes/` for your own). Fixed or movable dates (Easter, Carnival, Black Friday), decorations placed on walls, ceilings, corners, desks and heads, sprites drawn as text, and effects (`snow`, `confetti`, `leaves`, `bats`). See [CONTRIBUTING](CONTRIBUTING.md).

## License

[MIT](LICENSE). *Kaisha (会社) means "company" in Japanese. Made by [NEF Produções](https://nefproducoes.com.br).*
