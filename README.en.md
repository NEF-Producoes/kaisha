# Kaisha 会社

**A pixel-art office that shows your AI agents at work, live.**
Self-hosted, a single container, deploys on EasyPanel in five minutes. MIT licensed.

![Kaisha office](docs/escritorio.png)

Every agent gets a desk. When it starts a task the character types, the monitor lights up and a bubble shows what it is doing; waiting shows in yellow; an error turns the monitor red. Click an agent to see its history.

- **Works with anything** that can make an HTTP call: n8n, scripts, cron, Claude Code, OpenClaw, your backend.
- **The office is one file** (`office.yaml`): rooms, desks, furniture. Save it and every open browser redraws instantly.
- **Seasonal decoration**: Christmas, Festa Junina and other dates change the office on their own. A new theme is a folder with a text file.
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

**Office life**: idle agents walk around the office (coffee machine, water cooler, couch). When a task arrives their phone rings, they run to their desk and sit down to work. An agent with `central: true` always stays at the desk and tasks fly from it to whoever picks them up, which suits an orchestrator.

## Themes

Themes live in `themes/<id>/theme.yaml` (or `/data/themes/` for your own). Fixed or movable dates (Easter, Carnival, Black Friday), decorations placed on walls, ceilings, corners, desks and heads, sprites drawn as text, and effects (`snow`, `confetti`, `leaves`). See [CONTRIBUTING](CONTRIBUTING.md).

## License

[MIT](LICENSE). *Kaisha (会社) means "company" in Japanese. Made by [NEF Produções](https://nefproducoes.com.br).*
