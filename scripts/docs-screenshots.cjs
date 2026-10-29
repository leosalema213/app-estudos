// Documentation only: a temporary profile with authored, nonpersonal study examples.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { _electron: electron } = require('playwright');
const { BookFiles } = require('../electron/books.cjs');
const root = path.resolve(__dirname, '..');
let app, directory;

function guide(title, subtitle, chapters, color) {
  const escape = text => text.replace(/[()\\]/g, '\\$&');
  const objects = [null, '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const pages = [];
  for (const [i, chapter] of [null, ...chapters].entries()) {
    const text = i === 0
      ? `${color} rg 0 0 420 595 re f 0.16 0.18 0.2 rg BT /F1 11 Tf 36 520 Td (CADERNOS DE ESTUDO) Tj /F1 25 Tf 0 -85 Td (${escape(title)}) Tj /F1 13 Tf 0 -36 Td (${escape(subtitle)}) Tj /F1 10 Tf 0 -255 Td (Organon / guia de exemplo) Tj ET`
      : `0.98 0.97 0.95 rg 0 0 420 595 re f 0.18 0.18 0.18 rg BT /F1 11 Tf 36 545 Td (${escape(title)}) Tj /F1 22 Tf 0 -55 Td (${escape(chapter[0])}) Tj /F1 12 Tf 0 -38 Td ${chapter.slice(1).map((line, n) => `${n ? '0 -24 Td ' : ''}(${escape(line)}) Tj`).join(' ')} /F1 10 Tf 0 -180 Td (Anote uma ideia. Pratique. Revise amanha.) Tj ET`;
    const stream = objects.push(`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`);
    const page = objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 595] /Resources << /Font << /F1 3 0 R >> >> /Contents ${stream} 0 R >>`);
    pages.push(`${page} 0 R`);
  }
  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = `<< /Type /Pages /Kids [${pages.join(' ')}] /Count ${pages.length} >>`;
  let pdf = '%PDF-1.4\n', offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

(async () => {
  const { seed, firstPlan, newNotebook, dayKey, uid, recordKey, validateData } = await import('../src/model.js');
  const { basicModel, newCard } = await import('../src/anki.js');
  const { newReminder } = await import('../src/reminders.js');
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'organon-docs-'));
  const profile = path.join(directory, 'profile'); fs.mkdirSync(profile);
  const data = seed(), today = dayKey(), now = Date.now();
  data.onboardingCompleted = true; data.settings = { ...data.settings, theme: 'dark', sound: false, startWithWindows: false, plansView: 'list' };
  const note = (title, text) => ({ id: uid(), title, text, date: today, images: [], pinned: false });
  const english = { ...firstPlan(), name: 'Inglês no dia a dia', description: 'Construir vocabulário e conversar com mais confiança.', color: 'violet', icon: 'book', days: [1,2,3,4,5] };
  const networks = { ...firstPlan(), name: 'Fundamentos de redes', description: 'Entender endereçamento IP e montar uma rede local.', color: 'blue', icon: 'book', days: [1,2,3,4,5] };
  const linux = { ...firstPlan(), name: 'Linux: primeiros passos', description: 'Navegação, arquivos e permissões no terminal.', color: 'green', icon: 'book', days: [1,2,3,4,5] };
  [english, networks, linux].forEach((plan, n) => { plan.blocks = plan.blocks.map((block, i) => ({ ...block, name: [['Vocabulário: rotina e hábitos', 'Pausa para respirar', 'Leitura e conversação'], ['Endereçamento IPv4', 'Pausa para respirar', 'Prática: rede local'], ['Navegar entre diretórios', 'Pausa para respirar', 'Arquivos e permissões']][n][i] })); });
  english.notes = [note('Present simple: hábitos e rotina', 'I study every morning.\nUse o present simple para hábitos e situações frequentes.\nNa terceira pessoa: she studies, he works.\nPróxima revisão: perguntas com do e does.')];
  networks.notes = [note('IP, máscara e gateway', 'O endereço IP identifica uma interface na rede.\nA máscara delimita a parte da rede e a dos hosts.\nO gateway encaminha o tráfego para outras redes.')];
  linux.notes = [note('Comandos para começar', 'pwd mostra o diretório atual.\nls lista arquivos.\ncd muda de diretório.\nAntes de alterar permissões, confira o proprietário do arquivo.')];
  data.plans = [english, networks, linux];
  for (let days = 4; days >= 0; days--) {
    const date = new Date(); date.setDate(date.getDate() - days); const key = dayKey(date);
    for (const [n, plan] of data.plans.entries()) for (const [i, block] of plan.blocks.entries()) {
      if (days === 0 && (n > 0 || i > 0)) continue;
      data.records[recordKey(key, plan.id, block.id)] = { elapsedMs: block.minutes * 60000, done: true, type: block.type, planName: plan.name, blockName: block.name };
    }
  }
  const nb = newNotebook(); nb.name = 'Inglês · vocabulário'; nb.pages = [note('Rotina e hábitos', 'to wake up — acordar\nto have breakfast — tomar café da manhã\nto commute — ir para o trabalho\n\nI usually read before bed.\nEu costumo ler antes de dormir.')]; data.notebooks = [nb];
  data.reminders = [{ ...newReminder(today), title: 'Revisar as palavras da semana', description: 'Retomar o baralho de inglês por alguns minutos antes da leitura.' }, { ...newReminder(today), title: 'Desenhar uma rede local', description: 'Identificar computador, roteador, gateway e endereços IP.' }];
  const files = new BookFiles(profile);
  const guides = [
    ['Inglês no cotidiano', 'English every day', 'Small steps, daily practice', [['Daily routines', 'I wake up at seven.', 'I read a little every day.', 'She studies in the morning.'], ['Questions', 'Do you work from home?', 'Does she speak English?', 'Try answering with a full sentence.'], ['In conversation', 'Could you say that again?', 'What does this word mean?', 'Take your time and keep practising.']], '0.82 0.79 0.9', english, 2],
    ['Redes: um guia visual', 'Redes: guia visual', 'Conceitos para a sua primeira rede', [['Rede local', 'Uma rede conecta dispositivos.', 'O switch conecta portas na rede local.', 'O roteador conecta redes diferentes.'], ['IPv4', 'Um endereco identifica uma interface.', 'A mascara define o prefixo da rede.', 'O gateway encaminha para outras redes.'], ['Pratica', 'Desenhe os dispositivos e as conexoes.', 'Anote os enderecos e a mascara.', 'Confira a conectividade entre os hosts.']], '0.75 0.83 0.88', networks, 1],
    ['Linux: guia de comandos', 'Linux no terminal', 'Arquivos, diretorios e permissoes', [['Primeiros comandos', 'pwd: mostra o diretorio atual.', 'ls: lista arquivos e diretorios.', 'cd: muda de diretorio.'], ['Arquivos', 'mkdir: cria um diretorio.', 'cp: copia um arquivo.', 'mv: move ou renomeia.'], ['Permissoes', 'Confira o dono com ls -l.', 'r significa leitura; w, escrita.', 'x permite executar ou atravessar.']], '0.77 0.86 0.79', linux, 4],
  ];
  for (const [title, heading, subtitle, chapters, color, plan, page] of guides) {
    const file = path.join(directory, `${heading}.pdf`); fs.writeFileSync(file, guide(heading, subtitle, chapters, color));
    data.books.push({ ...files.import(file), title, planIds: [plan.id], page, furthestPage: page, pageCount: 4, completedAt: page === 4 ? today : null });
  }
  const a = data.anki; a.models = [structuredClone(basicModel)];
  a.decks = data.plans.map((plan, i) => ({ id: `docs-deck-${i}`, name: ['Inglês · rotina e hábitos', 'Redes · conceitos essenciais', 'Linux · comandos básicos'][i], presetId: 'default', planIds: [plan.id] }));
  const questions = [
    [['How do you say “acordar” in English?', 'To wake up.'], ['Complete: She ___ every morning.', 'She studies every morning.'], ['What does “usually” mean?', 'Geralmente; habitualmente.'], ['How do you ask someone to repeat?', 'Could you say that again?']],
    [['Qual é a função do gateway?', 'Encaminhar o tráfego destinado a outras redes.'], ['O que a máscara de rede delimita?', 'A parte do endereço que identifica a rede e a parte dos hosts.'], ['Qual equipamento conecta redes diferentes?', 'O roteador.']],
    [['Qual comando mostra o diretório atual?', 'pwd'], ['Como listar arquivos no terminal?', 'ls'], ['Qual comando muda de diretório?', 'cd']],
  ];
  questions.forEach((items, deck) => items.forEach(([front, back], i) => {
    const id = uid(); a.notes.push({ id, modelId: basicModel.id, fields: [front, back], tags: [deck ? 'fundamentos' : 'vocabulário'] });
    a.cards.push({ ...newCard(id, a.decks[deck].id), position: i, ...(i ? { state: 2, due: now - 1000, interval: 3, reps: 4 } : {}) });
  }));
  a.reviews = Array.from({ length: 32 }, (_, i) => ({ id: uid(), cardId: a.cards[i % a.cards.length].id, at: now - Math.floor(i / 8) * 86400000, rating: i % 8 === 0 ? 1 : 3, elapsedMs: 18000 + i % 4 * 4000 }));
  fs.writeFileSync(path.join(profile, 'compasso.json'), JSON.stringify(validateData(data)));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [root, `--user-data-dir=${profile}`, '--skip-account-prompt'], env });
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1000));
  const shot = async file => { await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: path.join(root, 'docs', file), animations: 'disabled' }); };
  await page.getByRole('heading', { name: 'Meu dia', exact: true }).waitFor(); await shot('interface.png');
  await page.getByRole('button', { name: 'Planos de estudo', exact: true }).click(); await shot('planos-lista.png');
  await page.getByRole('button', { name: 'Cadernos', exact: true }).click(); await shot('cadernos.png');
  await page.getByRole('button', { name: `Abrir caderno ${nb.name}`, exact: true }).click();
  await page.locator('.tiptap').waitFor(); await shot('pagina-caderno.png');
  await page.getByRole('button', { name: 'Livros', exact: true }).click();
  await page.locator('.reading-card img').nth(2).waitFor(); await shot('livros.png');
  await page.getByRole('button', { name: 'Anki', exact: true }).click(); await shot('anki-baralhos.png');
  await page.getByRole('button', { name: a.decks[0].name, exact: true }).click(); await page.getByRole('button', { name: 'Estudar agora', exact: true }).click();
  await page.getByRole('button', { name: /Mostrar resposta/ }).waitFor();
  await page.getByRole('button', { name: /Mostrar resposta/ }).click();
  await page.frameLocator('iframe[title="Verso da carta"]').locator('.card').waitFor(); await shot('anki-revisao.png');
  await page.getByRole('button', { name: 'Meu progresso', exact: true }).click(); await shot('progresso.png');
  await page.locator('.anki-progress-section').screenshot({ path: path.join(root, 'docs', 'progresso-anki.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Notas', exact: true }).click(); await shot('notas.png');
  console.log('Imagens da documentação atualizadas com dados fictícios: planos, livros, Anki, notas e progresso.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (app) await app.close();
  if (directory) { const target = path.resolve(directory); if (path.dirname(target) === path.resolve(os.tmpdir()) && path.basename(target).startsWith('organon-docs-')) fs.rmSync(target, { recursive: true, force: true }); }
});
