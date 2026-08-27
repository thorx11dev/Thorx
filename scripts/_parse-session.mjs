import fs from 'node:fs';

const path = process.argv[2] || 'C:/Users/Lenovo/Downloads/assalam-u-alaikum-greeting.json';
const raw = fs.readFileSync(path, 'utf8');
const data = JSON.parse(raw);

const out = [];
const p = (s = '') => out.push(s);

const clip = (s, n = 700) => {
  if (s == null) return '';
  s = String(s).replace(/\r/g, '');
  if (s.length <= n) return s;
  return s.slice(0, n) + ` …[+${s.length - n} chars]`;
};

const i = data.info || {};
p('===== SESSION INFO =====');
p(`title: ${i.title}`);
p(`id: ${i.id}  slug: ${i.slug}`);
p(`dir: ${i.directory}`);
p(`agent: ${i.agent}  model: ${JSON.stringify(i.model)}`);
p(`version: ${i.version}`);
p(`created: ${new Date(i.time?.created).toISOString()}  updated: ${new Date(i.time?.updated).toISOString()}`);
p(`tokens: ${JSON.stringify(i.tokens)}`);
p(`summary: ${JSON.stringify(i.summary)}`);

const msgs = data.messages || [];
p(`\n===== MESSAGES: ${msgs.length} =====\n`);

let idx = 0;
for (const m of msgs) {
  idx++;
  const info = m.info || {};
  const role = info.role;
  const t = info.time?.created ? new Date(info.time.created).toISOString() : '';
  p(`\n----- [#${idx}] ${role?.toUpperCase()}  ${t}  (${info.modelID || info.model?.modelID || ''}) -----`);
  const parts = m.parts || [];
  for (const part of parts) {
    const type = part.type;
    if (type === 'text') {
      p(`  TEXT: ${clip(part.text, role === 'user' ? 4000 : 1200)}`);
    } else if (type === 'reasoning') {
      p(`  REASONING: ${clip(part.text, 300)}`);
    } else if (type === 'tool') {
      const name = part.tool || part.name;
      const st = part.state || {};
      const input = st.input ?? part.input;
      const inputStr = typeof input === 'object' ? JSON.stringify(input) : String(input ?? '');
      p(`  TOOL[${name}] status=${st.status || ''}`);
      p(`     in: ${clip(inputStr, 500)}`);
      const output = st.output ?? st.result ?? part.output;
      if (output != null) {
        const o = typeof output === 'object' ? JSON.stringify(output) : String(output);
        p(`     out: ${clip(o, 400)}`);
      }
      if (st.metadata?.title) p(`     title: ${clip(st.metadata.title, 200)}`);
    } else if (type === 'file') {
      p(`  FILE: ${part.filename || part.url || ''} (${part.mime || ''})`);
    } else if (type === 'step-start' || type === 'step-finish') {
      // skip
    } else if (type === 'patch' || type === 'snapshot') {
      p(`  ${type.toUpperCase()}: ${clip(JSON.stringify(part).slice(0, 200))}`);
    } else {
      p(`  <${type}>: ${clip(JSON.stringify(part), 200)}`);
    }
  }
}

fs.writeFileSync('scripts/_session-transcript.txt', out.join('\n'), 'utf8');
console.log('messages:', msgs.length);
console.log('bytes written:', out.join('\n').length);

// Also emit a compact list of user messages only
const userMsgs = [];
for (const m of msgs) {
  if (m.info?.role !== 'user') continue;
  const txt = (m.parts || []).filter(x => x.type === 'text').map(x => x.text).join('\n');
  if (txt.trim()) userMsgs.push(txt.trim());
}
fs.writeFileSync('scripts/_session-user-msgs.txt', userMsgs.map((t, n) => `\n=== USER MSG #${n + 1} ===\n${t}`).join('\n'), 'utf8');
console.log('user messages:', userMsgs.length);

// Tool usage histogram
const hist = {};
for (const m of msgs) for (const part of (m.parts || [])) if (part.type === 'tool') { const n = part.tool || part.name; hist[n] = (hist[n] || 0) + 1; }
console.log('tool histogram:', JSON.stringify(hist));
