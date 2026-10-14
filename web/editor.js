// Kaisha · editor do escritório no painel (nome, salas, móveis e agentes)
// Edita um rascunho do office.yaml na tela; "Salvar" grava no servidor (precisa da chave da API).
import { T, FURNITURE, FLOORS, WALLS, SHIRTS, furniture, furnitureKey } from './sprites.js?v=__V__';

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, attrs = {}, ...filhos) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const f of filhos) if (f != null) e.append(f);
  return e;
};
const NOMES_MOVEIS = { estante: 'Estante', planta: 'Planta', relogio: 'Relógio', janela: 'Janela', quadro: 'Quadro', grafico: 'Gráfico', bebedouro: 'Bebedouro', arquivo: 'Arquivo', sofa: 'Sofá', mesa_reuniao: 'Mesa de reunião', impressora: 'Impressora', tapete: 'Tapete', cafe: 'Café' };
const PISOS = ['madeira', 'madeira_escura', 'carpete_azul', 'carpete_verde', 'ladrilho', 'xadrez'].filter((p) => FLOORS[p]);
const PAREDES = ['clara', 'azul', 'verde', 'escura'].filter((p) => WALLS[p]);
const CORES = ['vermelho', 'laranja', 'amarelo', 'verde', 'azul', 'roxo', 'rosa', 'cinza', 'preto', 'branco'].filter((c) => SHIRTS[c]);
const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
const CHAVE = 'kaisha_api_key';
const lerChave = () => { try { return localStorage.getItem(CHAVE) || ''; } catch { return ''; } };
const gravarChave = (v) => { try { if (v) localStorage.setItem(CHAVE, v); else localStorage.removeItem(CHAVE); } catch { /* sem armazenamento */ } };

export function initEditor({ state, rebuild, canvas, applySnapshot }) {
  const painel = $('#editor');
  const corpo = $('#ed-body');
  const msg = $('#ed-msg');
  let original = null;  // escritório antes de editar (para descartar)
  let aba = 'escritorio';
  let sel = null;       // { tipo: 'agente'|'movel'|'sala', i }
  let colocar = null;   // tipo de móvel escolhido na paleta
  let arrasto = null;
  let chave = lerChave();

  const draft = () => state.snap.office;
  const aviso = (t, tipo = '') => { msg.textContent = t; msg.dataset.tipo = tipo; };
  const mudou = () => { rebuild(); state.editDirty = true; aviso('alterações não salvas', 'pendente'); };

  // ---------- abrir / fechar ----------
  async function abrir() {
    if (!chave) return pedirChave();
    const ok = await fetch('/api/auth', { headers: { apikey: chave } }).then((r) => r.ok).catch(() => false);
    if (!ok) { chave = ''; gravarChave(''); return pedirChave('chave inválida'); }
    original = structuredClone(state.snap.office);
    state.snap = { ...state.snap, office: structuredClone(original) };
    state.editing = true; state.editDirty = false;
    document.body.classList.add('editing');
    painel.hidden = false;
    window.dispatchEvent(new Event('resize'));
    aviso('arraste mesas e móveis no mapa');
    render();
  }
  function fechar(salvo) {
    state.editing = false; sel = null; colocar = null; arrasto = null;
    document.body.classList.remove('editing');
    painel.hidden = true;
    window.dispatchEvent(new Event('resize'));
    if (!salvo) { state.snap = { ...state.snap, office: original }; rebuild(); }
    if (state.pendingSnap) { const p = state.pendingSnap; state.pendingSnap = null; applySnapshot(p); }
  }
  function pedirChave(erro) {
    painel.hidden = false;
    corpo.replaceChildren(
      el('p', { class: 'ed-help' }, 'Para editar o escritório, informe a chave da API (a mesma do KAISHA_API_KEY). Ela fica guardada só neste navegador.'),
      el('form', { class: 'ed-key', onsubmit: (e) => { e.preventDefault(); chave = $('#ed-key-in').value.trim(); gravarChave(chave); abrir(); } },
        el('input', { id: 'ed-key-in', type: 'password', placeholder: 'chave da API', autocomplete: 'off', required: true }),
        el('button', { class: 'btn primary', type: 'submit' }, 'Entrar')),
    );
    $('#ed-tabs').hidden = true; $('#ed-foot').hidden = true;
    aviso(erro || '', erro ? 'erro' : '');
  }
  async function salvar() {
    aviso('salvando…');
    const r = await fetch('/api/office', { method: 'PUT', headers: { apikey: chave, 'content-type': 'application/json' }, body: JSON.stringify(draft()) }).catch(() => null);
    if (!r) return aviso('sem conexão com o servidor', 'erro');
    if (r.status === 401) { chave = ''; gravarChave(''); return pedirChave('chave inválida'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return aviso((j.erros || [j.erro || 'erro ao salvar']).join(' · '), 'erro');
    fechar(true);
  }

  // ---------- formulário ----------
  const campo = (rotulo, input) => el('label', { class: 'ed-field' }, el('span', {}, rotulo), input);
  const texto = (valor, aoMudar, attrs = {}) => el('input', { type: 'text', value: valor ?? '', ...attrs, oninput: (e) => aoMudar(e.target.value) });
  const numero = (valor, aoMudar, attrs = {}) => el('input', { type: 'number', value: valor, step: 1, ...attrs, oninput: (e) => { const n = parseInt(e.target.value, 10); if (Number.isFinite(n)) aoMudar(n); } });
  const escolha = (valor, opcoes, aoMudar) => {
    const s = el('select', { onchange: (e) => aoMudar(e.target.value) });
    for (const [v, t] of opcoes) s.append(el('option', { value: v, selected: v === valor }, t));
    return s;
  };
  const marca = (valor, rotulo, aoMudar) => el('label', { class: 'ed-check' }, el('input', { type: 'checkbox', checked: !!valor, onchange: (e) => aoMudar(e.target.checked) }), rotulo);

  function render() {
    $('#ed-tabs').hidden = false; $('#ed-foot').hidden = false;
    for (const b of document.querySelectorAll('#ed-tabs button')) b.setAttribute('aria-selected', String(b.dataset.aba === aba));
    const o = draft();
    const out = [];
    if (aba === 'escritorio') {
      const temas = [['auto', 'Automático (pelo calendário)'], ['nenhum', 'Nenhum'], ...(state.snap.themes || []).map((t) => [t.id, t.name])];
      out.push(
        campo('Nome', texto(o.name, (v) => { o.name = v; document.getElementById('office-name').textContent = v; state.editDirty = true; })),
        campo('Tema', escolha(o.theme === 'none' ? 'nenhum' : o.theme, temas, (v) => { o.theme = v; mudou(); })),
        campo('Planta', escolha(o.plan, [['open', 'Aberta (um salão com divisórias)'], ['rooms', 'Salas separadas']], (v) => { o.plan = v; mudou(); })),
        el('p', { class: 'ed-help' }, 'Mesas e móveis se movem arrastando no mapa. Salas: aba Salas.'),
      );
    }
    if (aba === 'agentes') {
      out.push(el('button', { class: 'btn', type: 'button', onclick: novoAgente }, '+ Agente'));
      o.agents.forEach((a, i) => {
        const ativo = sel && sel.tipo === 'agente' && sel.i === i;
        out.push(el('fieldset', { class: 'ed-card' + (ativo ? ' sel' : ''), onclick: () => { if (!ativo) { sel = { tipo: 'agente', i }; render(); } } },
          el('legend', {}, a.name || a.id, el('small', {}, ' · ' + a.id)),
          campo('Nome', texto(a.name, (v) => { a.name = v; mudou(); })),
          campo('Id (o mesmo do campo agent no n8n)', texto(a.id, (v) => { const n = slug(v); if (n && !o.agents.some((x, j) => j !== i && x.id === n)) { a.id = n; mudou(); } })),
          campo('Cargo', texto(a.role, (v) => { a.role = v; mudou(); })),
          el('div', { class: 'ed-row' },
            campo('Cor', escolha(a.color || '', [['', 'automática'], ...CORES.map((c) => [c, c])], (v) => { a.color = v || null; mudou(); })),
            campo('Sala', escolha(a.room || '', [['', '—'], ...o.rooms.map((r) => [r.id, r.name])], (v) => { a.room = v || null; mudou(); }))),
          el('div', { class: 'ed-row' },
            marca(a.central, 'Central (fica na mesa)', (v) => { a.central = v; mudou(); }),
            marca(a.inspector, 'Inspetor de erros', (v) => { a.inspector = v; mudou(); })),
          el('button', { class: 'btn danger', type: 'button', onclick: (e) => { e.stopPropagation(); o.agents.splice(i, 1); sel = null; mudou(); render(); } }, 'Remover agente')));
      });
    }
    if (aba === 'salas') {
      out.push(el('button', { class: 'btn', type: 'button', onclick: novaSala }, '+ Sala'), el('p', { class: 'ed-help' }, 'Área em blocos: coluna, linha, largura e altura. Também dá para arrastar a sala no mapa.'));
      o.rooms.forEach((r, i) => {
        const ativo = sel && sel.tipo === 'sala' && sel.i === i;
        const area = (k) => numero(r.area[k], (n) => { r.area[k] = k >= 2 ? Math.max(k === 2 ? 3 : 4, n) : Math.max(0, n); mudou(); }, { min: 0 });
        out.push(el('fieldset', { class: 'ed-card' + (ativo ? ' sel' : ''), onclick: () => { if (!ativo) { sel = { tipo: 'sala', i }; render(); } } },
          el('legend', {}, r.name || r.id, el('small', {}, ' · ' + r.id)),
          campo('Nome', texto(r.name, (v) => { r.name = v; mudou(); })),
          el('div', { class: 'ed-row' },
            campo('Piso', escolha(r.floor, PISOS.map((p) => [p, p.replace('_', ' ')]), (v) => { r.floor = v; mudou(); })),
            campo('Parede', escolha(r.wall || 'clara', PAREDES.map((p) => [p, p]), (v) => { r.wall = v; mudou(); }))),
          el('div', { class: 'ed-row four' }, campo('Coluna', area(0)), campo('Linha', area(1)), campo('Largura', area(2)), campo('Altura', area(3))),
          el('button', { class: 'btn danger', type: 'button', disabled: o.rooms.length <= 1, onclick: (e) => { e.stopPropagation(); o.rooms.splice(i, 1); sel = null; mudou(); render(); } }, 'Remover sala')));
      });
    }
    if (aba === 'moveis') {
      const paleta = el('div', { class: 'ed-palette' });
      for (const k of Object.keys(NOMES_MOVEIS).filter((t) => FURNITURE[t])) {
        paleta.append(el('button', { type: 'button', class: 'chip' + (colocar === k ? ' on' : ''), onclick: () => { colocar = colocar === k ? null : k; sel = null; render(); } }, NOMES_MOVEIS[k]));
      }
      out.push(el('p', { class: 'ed-help' }, colocar ? `Clique no mapa para colocar: ${NOMES_MOVEIS[colocar]}.` : 'Escolha um móvel e clique no mapa. Arraste para mover; clique para selecionar.'), paleta);
      if (sel && sel.tipo === 'movel' && o.furniture[sel.i]) {
        const f = o.furniture[sel.i];
        out.push(el('fieldset', { class: 'ed-card sel' }, el('legend', {}, NOMES_MOVEIS[furnitureKey(f.type)] || f.type),
          el('p', { class: 'ed-help' }, `posição: coluna ${f.pos[0]}, linha ${f.pos[1]}`),
          marca(f.flip, 'Espelhar', (v) => { f.flip = v; mudou(); }),
          el('button', { class: 'btn danger', type: 'button', onclick: () => { o.furniture.splice(sel.i, 1); sel = null; mudou(); render(); } }, 'Remover móvel')));
      }
    }
    corpo.replaceChildren(...out);
  }

  function centroLivre() {
    const { W, H } = state.layout;
    return [Math.max(0, Math.floor(W / 2) - 1), Math.max(2, Math.floor(H / 2))];
  }
  function novoAgente() {
    const o = draft();
    let n = o.agents.length + 1, id = 'agente_' + n;
    while (o.agents.some((a) => a.id === id)) id = 'agente_' + ++n;
    o.agents.push({ id, name: 'Agente ' + n, role: '', room: null, desk: centroLivre(), color: null, hair: null, skin: null, shirt: null, central: false, inspector: false });
    sel = { tipo: 'agente', i: o.agents.length - 1 };
    mudou(); render();
    aviso('novo agente no centro: arraste a mesa para o lugar. O id (' + id + ') é o que o n8n usa no campo agent.', 'pendente');
  }
  function novaSala() {
    const o = draft();
    const { H } = state.layout;
    let n = o.rooms.length + 1, id = 'sala_' + n;
    while (o.rooms.some((r) => r.id === id)) id = 'sala_' + ++n;
    o.rooms.push({ id, name: 'Sala ' + n, area: [0, H, 10, 6], floor: 'madeira', wall: 'clara' });
    sel = { tipo: 'sala', i: o.rooms.length - 1 };
    mudou(); render();
  }

  // ---------- mapa: selecionar, arrastar e colocar ----------
  const bloco = (ev) => {
    const r = canvas.getBoundingClientRect();
    return [Math.floor((ev.clientX - r.left) / (state.scale * T)), Math.floor((ev.clientY - r.top) / (state.scale * T))];
  };
  const pegarMesa = (x, y) => draft().agents.findIndex((a) => a.desk && x >= a.desk[0] && x <= a.desk[0] + 1 && y >= a.desk[1] - 1 && y <= a.desk[1] + 1);
  const pegarMovel = (x, y) => {
    const fs = draft().furniture;
    for (let i = fs.length - 1; i >= 0; i--) {
      const def = furniture(fs[i].type); if (!def) continue;
      const w = Math.ceil(def.w / T), h = Math.ceil(def.h / T);
      if (x >= fs[i].pos[0] && x < fs[i].pos[0] + w && y >= fs[i].pos[1] && y < fs[i].pos[1] + h) return i;
    }
    return -1;
  };
  const pegarSala = (x, y) => { const rs = draft().rooms; for (let i = rs.length - 1; i >= 0; i--) { const [rx, ry, rw, rh] = rs[i].area; if (x >= rx && x < rx + rw && y >= ry && y < ry + rh) return i; } return -1; };

  canvas.addEventListener('pointerdown', (ev) => {
    if (!state.editing) return;
    const [x, y] = bloco(ev);
    const o = draft();
    if (colocar) {
      o.furniture.push({ type: colocar, pos: [x, y], room: null, flip: false });
      sel = { tipo: 'movel', i: o.furniture.length - 1 }; aba = 'moveis'; colocar = null;
      mudou(); render(); return;
    }
    let i;
    if ((i = pegarMesa(x, y)) >= 0) { sel = { tipo: 'agente', i }; arrasto = { alvo: o.agents[i].desk, ini: [x, y], de: [...o.agents[i].desk] }; if (aba !== 'agentes') aba = 'agentes'; }
    else if ((i = pegarMovel(x, y)) >= 0) { sel = { tipo: 'movel', i }; arrasto = { alvo: o.furniture[i].pos, ini: [x, y], de: [...o.furniture[i].pos] }; aba = 'moveis'; }
    else if (aba === 'salas' && (i = pegarSala(x, y)) >= 0) { sel = { tipo: 'sala', i }; arrasto = { alvo: o.rooms[i].area, ini: [x, y], de: [...o.rooms[i].area] }; }
    else sel = null;
    if (arrasto) canvas.setPointerCapture(ev.pointerId);
    render();
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!state.editing || !arrasto) return;
    const [x, y] = bloco(ev);
    const nx = Math.max(0, arrasto.de[0] + x - arrasto.ini[0]), ny = Math.max(0, arrasto.de[1] + y - arrasto.ini[1]);
    if (nx === arrasto.alvo[0] && ny === arrasto.alvo[1]) return;
    arrasto.alvo[0] = nx; arrasto.alvo[1] = ny;
    mudou();
  });
  const soltar = () => { if (arrasto) { arrasto = null; render(); } };
  canvas.addEventListener('pointerup', soltar);
  canvas.addEventListener('pointercancel', soltar);
  document.addEventListener('keydown', (ev) => {
    if (!state.editing || !sel || ev.target.closest('input, select, textarea')) return;
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      const o = draft();
      if (sel.tipo === 'movel') o.furniture.splice(sel.i, 1);
      sel = null; mudou(); render();
    }
  });

  // contorno do que está selecionado e grade de blocos (desenhado pelo app a cada quadro)
  state.editDraw = (g) => {
    const { W, H } = state.layout;
    g.fillStyle = 'rgba(255,255,255,0.06)';
    for (let x = 1; x < W; x++) g.fillRect(x * T, 0, 0.5, H * T);
    for (let y = 1; y < H; y++) g.fillRect(0, y * T, W * T, 0.5);
    if (!sel) return;
    const o = draft();
    let r = null;
    if (sel.tipo === 'agente' && o.agents[sel.i]?.desk) { const [x, y] = o.agents[sel.i].desk; r = [x * T, (y - 1) * T, 2 * T, 3 * T]; }
    if (sel.tipo === 'movel' && o.furniture[sel.i]) { const f = o.furniture[sel.i], d = furniture(f.type); if (d) r = [f.pos[0] * T, f.pos[1] * T, Math.ceil(d.w / T) * T, Math.ceil(d.h / T) * T]; }
    if (sel.tipo === 'sala' && o.rooms[sel.i]) { const [x, y, w, h] = o.rooms[sel.i].area; r = [x * T, y * T, w * T, h * T]; }
    if (!r) return;
    g.strokeStyle = '#f2c14e'; g.lineWidth = 1; g.setLineDash([3, 2]);
    g.strokeRect(r[0] + 0.5, r[1] + 0.5, r[2] - 1, r[3] - 1);
    g.setLineDash([]);
  };

  // ---------- botões ----------
  $('#edit-btn').addEventListener('click', () => (state.editing ? null : abrir()));
  $('#ed-close').addEventListener('click', () => { if (state.editing && state.editDirty && !confirmarDescarte()) return; fechar(false); });
  $('#ed-save').addEventListener('click', salvar);
  $('#ed-discard').addEventListener('click', () => fechar(false));
  $('#ed-logout').addEventListener('click', () => { chave = ''; gravarChave(''); fechar(false); });
  for (const b of document.querySelectorAll('#ed-tabs button')) b.addEventListener('click', () => { aba = b.dataset.aba; sel = null; colocar = null; render(); });
  // sem diálogo do navegador: um segundo clique em fechar confirma o descarte
  let avisado = 0;
  function confirmarDescarte() {
    if (Date.now() - avisado < 4000) return true;
    avisado = Date.now(); aviso('há alterações não salvas: clique em fechar de novo para descartar', 'erro');
    return false;
  }
  // usado pelo app para ids de agentes novos
  return { slug };
}
