// Andares: vários escritórios no mesmo Kaisha, cada um com sua planta, seus agentes, seu placar e sua chave.
// O andar principal é o /data/office.yaml; os outros são /data/andares/<id>.yaml.
import fs from 'node:fs';
import path from 'node:path';
import { createOfficeStore, validateOffice, toYaml, ROOT } from './office.js';

export const FLOOR_ID = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const EXEMPLOS = path.join(ROOT, 'examples', 'andares');

export function createFloors({ dataDir, tz, log, mainId, onChange, onList }) {
  const dir = path.join(dataDir, 'andares');
  fs.mkdirSync(dir, { recursive: true });
  const floors = new Map(); // id -> store

  const abrir = (id, officeFile) => {
    const store = createOfficeStore({
      dataDir, officeFile, tz, log, rotulo: id === mainId ? 'office.yaml' : `andares/${id}.yaml`,
      onChange: (snap) => onChange?.(id, snap),
    });
    floors.set(id, store);
  };
  abrir(mainId, path.join(dataDir, 'office.yaml'));

  // procura andares novos ou apagados na pasta (dá para criar um andar só copiando um arquivo)
  const assinaturaLista = () => list().map((f) => `${f.id}:${f.name}:${f.order}`).join('|');
  function scan() {
    const antes = assinaturaLista();
    const achados = new Set();
    for (const f of fs.readdirSync(dir)) {
      const m = /^(.+)\.ya?ml$/.exec(f);
      if (!m || !FLOOR_ID.test(m[1]) || m[1] === mainId) continue;
      achados.add(m[1]);
      if (!floors.has(m[1])) abrir(m[1], path.join(dir, f));
    }
    for (const id of [...floors.keys()]) if (id !== mainId && !achados.has(id)) { floors.get(id).close(); floors.delete(id); log.info?.(`andar "${id}" removido`); }
    if (assinaturaLista() !== antes) onList?.(list());
  }

  function list() {
    const out = [...floors.entries()].map(([id, s]) => { const o = s.snapshot().office; return { id, name: o.name, order: o.order, main: id === mainId }; });
    return out.sort((a, b) => (b.main - a.main) || ((a.order ?? 999) - (b.order ?? 999)) || a.name.localeCompare(b.name));
  }

  // cria um andar vazio (ou com o conteúdo enviado pelo editor)
  function create(id, dados) {
    if (!FLOOR_ID.test(id)) return { erros: ['id do andar: use letras minúsculas, números, _ ou - (até 32)'] };
    if (floors.has(id)) return { erros: [`o andar "${id}" já existe`] };
    const { erros, office } = validateOffice(dados);
    if (erros.length) return { erros };
    fs.writeFileSync(path.join(dir, `${id}.yaml`), toYaml(office));
    scan();
    return { erros: [] };
  }

  // KAISHA_ANDARES=nef,consultorio: cria os andares que ainda não existem a partir de examples/andares/<id>.yaml.
  // Agentes do exemplo que estavam no andar principal mudam de andar (saem do office.yaml principal).
  function seed(ids, db) {
    for (const id of ids) {
      if (!FLOOR_ID.test(id) || id === mainId || fs.existsSync(path.join(dir, `${id}.yaml`))) continue;
      const exemplo = path.join(EXEMPLOS, `${id}.yaml`);
      if (fs.existsSync(exemplo)) fs.copyFileSync(exemplo, path.join(dir, `${id}.yaml`));
      else fs.writeFileSync(path.join(dir, `${id}.yaml`), toYaml(validateOffice({ name: id, plan: 'open', rooms: [{ id: 'salao', name: 'Salão', area: [0, 0, 16, 10] }] }).office));
      log.info?.(`andar "${id}" criado${fs.existsSync(exemplo) ? ' a partir do exemplo' : ''}`);
      scan();
      // agentes que já têm andar próprio (outro andar além do principal) não mudam
      const outros = new Set(list().filter((f) => f.id !== id && f.id !== mainId).flatMap((f) => floors.get(f.id).snapshot().office.agents.map((a) => a.id)));
      const novos = floors.get(id).snapshot().office.agents.map((a) => a.id).filter((a) => !outros.has(a));
      const principal = floors.get(mainId);
      const o = structuredClone(principal.snapshot().office);
      const ficam = o.agents.filter((a) => !novos.includes(a.id));
      if (ficam.length !== o.agents.length) {
        const saem = o.agents.filter((a) => novos.includes(a.id)).map((a) => a.id);
        o.agents = ficam;
        principal.save(o);
        log.info?.(`agentes ${saem.join(', ')} mudaram do andar principal para "${id}"`);
      }
      for (const a of novos) db?.move(a, mainId, id);
    }
  }

  // em qual andar um agente está declarado (o principal tem preferência)
  function floorOfAgent(agentId) {
    for (const f of list()) if (floors.get(f.id).snapshot().office.agents.some((a) => a.id === agentId)) return f.id;
    return null;
  }

  scan();
  setInterval(scan, 3000).unref();
  return { get: (id) => floors.get(id), has: (id) => floors.has(id), list, create, seed, floorOfAgent, ids: () => [...floors.keys()], mainId };
}

