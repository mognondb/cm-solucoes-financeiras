// Editor de publicações: conteúdos (artigos, manuais, painéis) e páginas de venda de infoprodutos.
// Uma publicação é uma lista de blocos; o servidor revalida tudo antes de salvar (api/blog_lib.php).
(function () {
  'use strict';

  const API = '';
  let authHeader = localStorage.getItem('cm_admin_auth') || sessionStorage.getItem('cm_admin_auth') || '';

  function limparSessaoSalva() {
    ['cm_admin_auth', 'cm_admin_papel'].forEach((k) => { localStorage.removeItem(k); sessionStorage.removeItem(k); });
  }

  const $ = (id) => document.getElementById(id);
  const loginScreen = $('loginScreen');
  const editorApp = $('editorApp');

  /* ============================================================ utilidades */

  function h(tag, props, ...filhos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const f of filhos.flat()) {
      if (f === null || f === undefined || f === false) continue;
      el.append(f.nodeType ? f : document.createTextNode(String(f)));
    }
    return el;
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  let avisoTimer = null;
  function aviso(msg, tipo) {
    const el = $('salvarFeedback');
    el.textContent = msg;
    el.className = 'admin-feedback ce-feedback' + (tipo ? ' ' + tipo : '');
    clearTimeout(avisoTimer);
    if (tipo !== 'error') avisoTimer = setTimeout(() => { el.textContent = ''; }, 4000);
  }

  let sujo = false;
  function sujar() {
    if (sujo) return;
    sujo = true;
    $('dirtyBadge').hidden = false;
  }
  function limpar() {
    sujo = false;
    $('dirtyBadge').hidden = true;
  }
  window.addEventListener('beforeunload', (e) => {
    if (!sujo) return;
    e.preventDefault();
    e.returnValue = '';
  });

  async function api(path, opcoes) {
    const res = await fetch(`${API}${path}`, { ...(opcoes || {}), headers: { Authorization: authHeader, ...((opcoes && opcoes.headers) || {}) } });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) { sair(); throw new Error('Sua sessão expirou. Entre de novo.'); }
    if (!res.ok) throw new Error(body.message || `Erro (HTTP ${res.status})`);
    return body;
  }

  async function enviarArquivo(file) {
    const fd = new FormData();
    fd.append('arquivo', file);
    return api('/api/admin/upload', { method: 'POST', body: fd });
  }

  function nomeLegivel(n) { return String(n || '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim(); }

  function paraInputLocal(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  /* ============================================================ estado */

  function novoPost() {
    return { id: '', tipo: 'blog', titulo: '', slug: '', resumo: '', capa: '', capaAlt: '', categoria: '', tags: '', status: 'rascunho', publicadoEm: '', seoDescricao: '', autor: '', precoLabel: '', gratuito: false, linkCompra: '', ctaRotulo: '', url: '', blocos: [] };
  }
  let post = novoPost();

  function carregarNoEstado(r) {
    post = {
      id: r.id, tipo: r.tipo || 'blog', titulo: r.titulo || '', slug: r.slug || '', resumo: r.resumoOriginal || '', capa: r.capa || '', capaAlt: r.capaAlt || '',
      categoria: r.categoria || '', tags: r.tags || '', status: r.status || 'rascunho', publicadoEm: r.publicadoEm || '', seoDescricao: r.seoDescricao || '',
      autor: r.autor || '', precoLabel: r.precoLabel || '', gratuito: !!r.gratuito, linkCompra: r.linkCompra || '', ctaRotulo: r.ctaRotulo || '', url: r.url || '', blocos: r.blocos || [],
    };
  }

  /* ============================================================ campos de formulário ligados ao objeto */

  function txt(rotulo, obj, chave, o = {}) {
    const campo = o.area
      ? h('textarea', { rows: o.linhas || 3, placeholder: o.ph || '', maxlength: o.max, class: o.mono ? 'ce-mono' : '' })
      : h('input', { type: o.tipo || 'text', placeholder: o.ph || '', maxlength: o.max, min: o.min, max: o.maxNum, class: o.mono ? 'ce-mono' : '' });
    campo.value = obj[chave] ?? '';
    campo.addEventListener('input', () => { obj[chave] = o.numero ? Number(campo.value) || 0 : campo.value; sujar(); if (o.ao) o.ao(); });
    return h('label', { class: 'ce-lbl' }, rotulo, campo, o.dica ? h('span', { class: 'ce-dica', text: o.dica }) : null);
  }

  function sel(rotulo, obj, chave, opcoes) {
    const s = h('select', {}, opcoes.map(([v, t]) => h('option', { value: v, text: t })));
    s.value = obj[chave];
    s.addEventListener('change', () => { obj[chave] = s.value; sujar(); });
    return h('label', { class: 'ce-lbl' }, rotulo, s);
  }

  function chk(rotulo, obj, chave) {
    const c = h('input', { type: 'checkbox' });
    c.checked = !!obj[chave];
    c.addEventListener('change', () => { obj[chave] = c.checked; sujar(); });
    return h('label', { class: 'checkbox-label ce-check' }, c, ' ', rotulo);
  }

  const linha = (...filhos) => h('div', { class: 'ce-linha' }, filhos);

  /* ============================================================ editor de texto formatado */

  function rico(obj, chave, o = {}) {
    const area = h('div', { class: 'ce-rico-area', contenteditable: 'true', 'data-ph': o.ph || 'Escreva aqui…', role: 'textbox', 'aria-multiline': 'true' });
    area.innerHTML = obj[chave] || ''; // vem do servidor já limpo (lista de tags permitidas)
    const atualizar = () => { obj[chave] = area.innerHTML; sujar(); };
    area.addEventListener('input', atualizar);
    area.addEventListener('paste', (e) => { // cola só o texto: não traz fontes, cores e lixo do Word/site
      e.preventDefault();
      const t = (e.clipboardData || window.clipboardData).getData('text/plain');
      const html = t.replace(/\r/g, '').split(/\n\s*\n/).map((p) => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
      document.execCommand('insertHTML', false, html);
    });
    const cmd = (nome, valor) => { area.focus(); document.execCommand(nome, false, valor); atualizar(); };
    const bloco = (tag) => { area.focus(); const atual = (document.queryCommandValue('formatBlock') || '').toLowerCase(); document.execCommand('formatBlock', false, atual === tag ? 'p' : tag); atualizar(); };
    const botoes = [
      ['<b>N</b>', 'Negrito', () => cmd('bold')],
      ['<i>I</i>', 'Itálico', () => cmd('italic')],
      ['<u>S</u>', 'Sublinhado', () => cmd('underline')],
      ['T1', 'Título', () => bloco('h2')],
      ['T2', 'Subtítulo', () => bloco('h3')],
      ['• Lista', 'Lista com marcadores', () => cmd('insertUnorderedList')],
      ['1. Lista', 'Lista numerada', () => cmd('insertOrderedList')],
      ['❝', 'Citação', () => bloco('blockquote')],
      ['Link', 'Inserir link', () => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) { alert('Selecione primeiro o texto que vai virar link.'); return; }
        const u = prompt('Endereço do link (https://...)');
        if (u) cmd('createLink', u.trim());
      }],
      ['Limpar', 'Tirar a formatação', () => { cmd('removeFormat'); bloco('p'); }],
    ];
    const barra = h('div', { class: 'ce-rico-barra' }, botoes.map(([rot, titulo, fn]) => {
      const b = h('button', { type: 'button', title: titulo, 'aria-label': titulo });
      b.innerHTML = rot;
      b.addEventListener('mousedown', (e) => e.preventDefault()); // mantém a seleção do texto
      b.addEventListener('click', fn);
      return b;
    }));
    return h('div', { class: 'ce-rico' + (o.compacto ? ' ce-rico-compacto' : '') }, barra, area);
  }

  /* ============================================================ envio de fotos e arquivos */

  function soltar(o) {
    const input = h('input', { type: 'file', hidden: true, accept: o.aceitar || '', multiple: !!o.multiplo });
    const caixa = h('div', { class: 'ce-soltar', tabindex: '0', role: 'button' }, h('strong', { text: o.texto }), ' ou arraste o arquivo para cá', input);
    async function processar(arquivos) {
      if (!arquivos.length) return;
      caixa.classList.add('enviando');
      aviso(`Enviando ${arquivos.length > 1 ? arquivos.length + ' arquivos' : arquivos[0].name}…`);
      try {
        for (const f of arquivos) await o.aoReceber(await enviarArquivo(f), f);
        aviso('Enviado.', 'success');
      } catch (err) {
        aviso(err.message, 'error');
      } finally {
        caixa.classList.remove('enviando');
        input.value = '';
      }
    }
    input.addEventListener('click', (e) => e.stopPropagation());
    caixa.addEventListener('click', () => input.click());
    caixa.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', () => processar([...input.files]));
    caixa.addEventListener('dragover', (e) => { e.preventDefault(); caixa.classList.add('sobre'); });
    caixa.addEventListener('dragleave', () => caixa.classList.remove('sobre'));
    caixa.addEventListener('drop', (e) => { e.preventDefault(); caixa.classList.remove('sobre'); processar([...e.dataTransfer.files].slice(0, o.multiplo ? 24 : 1)); });
    return caixa;
  }

  function campoFoto(obj, chave, refazer, extra = {}) {
    if (obj[chave]) {
      return h('div', { class: 'ce-foto' },
        h('img', { src: obj[chave], alt: '' }),
        h('div', { class: 'ce-foto-acoes' }, h('button', { type: 'button', text: 'Trocar foto', onclick: () => { obj[chave] = ''; if (extra.limpar) extra.limpar(); sujar(); refazer(); } })));
    }
    return soltar({
      texto: 'Escolher foto', aceitar: 'image/*',
      aoReceber: async (r) => { obj[chave] = r.url; if (extra.ao) extra.ao(r); sujar(); refazer(); },
    });
  }

  const EXT_ARQUIVOS = '.pdf,.xlsx,.xls,.xlsm,.xlsb,.csv,.ods,.docx,.doc,.odt,.pptx,.ppt,.zip,.pbix,.pbit,.txt,.json';

  /* ============================================================ tipos de bloco */

  const BLOCOS = {
    texto: {
      rot: 'Texto', desc: 'Parágrafos, títulos, listas, citações e links', grupo: 0,
      novo: () => ({ t: 'texto', html: '' }),
      corpo: (b) => [rico(b, 'html', { ph: 'Escreva aqui. Use T1 e T2 para títulos e subtítulos.' })],
    },
    imagem: {
      rot: 'Foto / imagem', desc: 'Uma imagem com legenda (print de planilha, foto, gráfico)', grupo: 0,
      novo: () => ({ t: 'imagem', url: '', alt: '', legenda: '', largura: 'normal', w: 0, h: 0 }),
      corpo: (b, refazer) => [
        campoFoto(b, 'url', refazer, { ao: (r) => { b.w = r.w; b.h = r.h; }, limpar: () => { b.w = 0; b.h = 0; } }),
        txt('Legenda (opcional)', b, 'legenda', { max: 300, ph: 'Ex.: Aba "Resumo" da planilha' }),
        txt('Descrição da imagem, para quem não consegue vê-la (opcional)', b, 'alt', { max: 200 }),
      ],
    },
    imagem_texto: {
      rot: 'Imagem ao lado do texto', desc: 'Foto de um lado e explicação do outro (ótimo para vendas)', grupo: 0,
      novo: () => ({ t: 'imagem_texto', url: '', alt: '', titulo: '', html: '', lado: 'esq' }),
      corpo: (b, refazer) => [
        campoFoto(b, 'url', refazer),
        txt('Título', b, 'titulo', { max: 160 }),
        rico(b, 'html', { ph: 'Explique o que a imagem mostra…', compacto: true }),
        linha(sel('Imagem fica à', b, 'lado', [['esq', 'Esquerda'], ['dir', 'Direita']]), txt('Descrição da imagem (opcional)', b, 'alt', { max: 200 })),
      ],
    },
    galeria: {
      rot: 'Galeria de fotos', desc: 'Várias imagens em grade, com legenda em cada uma', grupo: 0,
      novo: () => ({ t: 'galeria', colunas: 3, itens: [] }),
      corpo: (b, refazer) => [
        b.itens.length ? h('div', { class: 'ce-galeria' }, b.itens.map((it, i) => h('div', { class: 'ce-galeria-item' },
          h('img', { src: it.url, alt: '' }),
          h('input', { type: 'text', value: it.legenda || '', placeholder: 'Legenda', maxlength: '200', oninput: (e) => { it.legenda = e.target.value; sujar(); } }),
          h('button', { type: 'button', text: 'Remover', onclick: () => { b.itens.splice(i, 1); sujar(); refazer(); } })))) : null,
        soltar({ texto: 'Adicionar fotos', aceitar: 'image/*', multiplo: true, aoReceber: async (r) => { b.itens.push({ url: r.url, alt: '', legenda: '' }); sujar(); refazer(); } }),
        sel('Colunas', b, 'colunas', [[2, '2 colunas'], [3, '3 colunas'], [4, '4 colunas']]),
      ],
    },
    arquivo: {
      rot: 'Arquivo para baixar', desc: 'Planilha, PDF, modelo de painel (.pbix) ou outro arquivo', grupo: 1,
      novo: () => ({ t: 'arquivo', url: '', nome: '', descricao: '', ext: '', tamanho: 0 }),
      corpo: (b, refazer) => b.url ? [
        h('div', { class: 'ce-arq' }, h('span', { class: 'ce-arq-ico', text: (b.ext || 'arq').slice(0, 4) }), h('div', { class: 'ce-arq-info' }, b.nome || 'Arquivo', h('small', { text: b.url })),
          h('button', { type: 'button', class: 'ce-mini', text: 'Trocar', onclick: () => { b.url = ''; sujar(); refazer(); } })),
        txt('Nome que aparece para o visitante', b, 'nome', { max: 160 }),
        txt('Descrição (opcional)', b, 'descricao', { max: 300, ph: 'Ex.: Modelo pronto para preencher' }),
        h('p', { class: 'ce-dica', text: 'Atenção: qualquer pessoa com o endereço consegue baixar este arquivo. Para produtos pagos, entregue o arquivo pela plataforma de venda, não aqui.' }),
      ] : [
        soltar({ texto: 'Escolher arquivo', aceitar: EXT_ARQUIVOS, aoReceber: async (r) => { Object.assign(b, { url: r.url, nome: nomeLegivel(r.nome) + '.' + r.ext, ext: r.ext, tamanho: r.tamanho }); sujar(); refazer(); } }),
        h('p', { class: 'ce-dica', text: 'Aceita planilhas (xlsx, xls, csv), pdf, docx, pptx, zip, pbix, até 25 MB.' }),
      ],
    },
    tabela: {
      rot: 'Tabela', desc: 'Cole direto do Excel ou digite os dados', grupo: 1,
      novo: () => ({ t: 'tabela', cab: true, linhas: [['', '', ''], ['', '', ''], ['', '', '']], legenda: '' }),
      corpo: (b, refazer) => corpoTabela(b, refazer),
    },
    formula: {
      rot: 'Fórmula / código', desc: 'Fórmula de planilha com botão "Copiar"', grupo: 1,
      novo: () => ({ t: 'formula', rotulo: '', codigo: '' }),
      corpo: (b) => [txt('Título (opcional)', b, 'rotulo', { max: 120, ph: 'Ex.: Saldo acumulado' }), txt('Fórmula', b, 'codigo', { area: true, linhas: 3, mono: true, max: 6000, ph: '=SOMA(A1:A10)' })],
    },
    incorporar: {
      rot: 'Painel ou vídeo incorporado', desc: 'Power BI, Looker Studio, Google Planilhas, YouTube, Vimeo', grupo: 1,
      novo: () => ({ t: 'incorporar', url: '', titulo: '', legenda: '', altura: 520 }),
      corpo: (b) => [
        txt('Endereço (link)', b, 'url', { tipo: 'url', ph: 'https://…', max: 500 }),
        h('p', { class: 'ce-dica', text: 'Power BI: Arquivo > Incorporar relatório > "Publicar na Web" e cole o link. Looker Studio, Google Planilhas e YouTube: cole o link de compartilhamento.' }),
        linha(txt('Título (acessibilidade)', b, 'titulo', { max: 160 }), txt('Altura (px)', b, 'altura', { tipo: 'number', numero: true, min: 200, maxNum: 1400 })),
        txt('Legenda (opcional)', b, 'legenda', { max: 300 }),
      ],
    },
    painel: {
      rot: 'Painel interativo de demonstração', desc: 'O painel financeiro (dados fictícios) da página inicial, interativo', grupo: 1,
      novo: () => ({ t: 'painel', legenda: '' }),
      corpo: (b) => [h('p', { class: 'ce-dica', text: 'Mostra aqui o mesmo painel interativo da página inicial. O visitante pode clicar nos gráficos e filtros.' }), txt('Legenda (opcional)', b, 'legenda', { max: 300 })],
    },
    destaque: {
      rot: 'Caixa de destaque', desc: 'Dica, atenção, informação ou exemplo', grupo: 2,
      novo: () => ({ t: 'destaque', variante: 'dica', titulo: '', html: '' }),
      corpo: (b) => [
        linha(sel('Tipo', b, 'variante', [['dica', 'Dica'], ['atencao', 'Atenção'], ['info', 'Informação'], ['exemplo', 'Exemplo']]), txt('Título (opcional)', b, 'titulo', { max: 120 })),
        rico(b, 'html', { compacto: true }),
      ],
    },
    passos: {
      rot: 'Passo a passo', desc: 'Etapas numeradas, cada uma com texto e imagem', grupo: 2,
      novo: () => ({ t: 'passos', itens: [{ titulo: '', html: '', url: '', alt: '' }] }),
      corpo: (b, refazer) => [
        ...b.itens.map((it, i) => h('div', { class: 'ce-item' },
          h('div', { class: 'ce-item-topo' }, `Passo ${i + 1}`, h('span', {},
            h('button', { type: 'button', class: 'ce-ico', title: 'Subir', 'aria-label': 'Subir passo', text: '↑', disabled: i === 0 || null, onclick: () => { [b.itens[i - 1], b.itens[i]] = [b.itens[i], b.itens[i - 1]]; sujar(); refazer(); } }),
            h('button', { type: 'button', class: 'ce-ico', title: 'Descer', 'aria-label': 'Descer passo', text: '↓', disabled: i === b.itens.length - 1 || null, onclick: () => { [b.itens[i + 1], b.itens[i]] = [b.itens[i], b.itens[i + 1]]; sujar(); refazer(); } }),
            h('button', { type: 'button', class: 'ce-ico perigo', title: 'Remover passo', 'aria-label': 'Remover passo', text: '✕', onclick: () => { b.itens.splice(i, 1); sujar(); refazer(); } }))),
          txt('Título do passo', it, 'titulo', { max: 160 }),
          rico(it, 'html', { compacto: true, ph: 'Explique o passo…' }),
          campoFoto(it, 'url', refazer))),
        h('button', { type: 'button', class: 'ce-mini', text: '+ Adicionar passo', onclick: () => { b.itens.push({ titulo: '', html: '', url: '', alt: '' }); sujar(); refazer(); } }),
      ],
    },
    lista: {
      rot: 'Lista', desc: 'Lista com ✓, marcadores ou números (ex.: "O que você recebe")', grupo: 2,
      novo: () => ({ t: 'lista', titulo: '', estilo: 'check', itens: [''] }),
      corpo: (b) => {
        const area = h('textarea', { rows: 5, placeholder: 'Um item por linha' });
        area.value = b.itens.join('\n');
        area.addEventListener('input', () => { b.itens = area.value.split('\n'); sujar(); });
        return [linha(txt('Título (opcional)', b, 'titulo', { max: 160 }), sel('Estilo', b, 'estilo', [['check', 'Com ✓'], ['bullets', 'Marcadores'], ['numeros', 'Numerada']])), h('label', { class: 'ce-lbl' }, 'Itens (um por linha)', area)];
      },
    },
    faq: {
      rot: 'Perguntas frequentes', desc: 'Perguntas que abrem e fecham, com a resposta', grupo: 2,
      novo: () => ({ t: 'faq', titulo: '', itens: [{ p: '', r: '' }] }),
      corpo: (b, refazer) => [
        txt('Título (opcional)', b, 'titulo', { max: 160, ph: 'Perguntas frequentes' }),
        ...b.itens.map((it, i) => h('div', { class: 'ce-item' },
          h('div', { class: 'ce-item-topo' }, `Pergunta ${i + 1}`, h('button', { type: 'button', class: 'ce-ico perigo', title: 'Remover', 'aria-label': 'Remover pergunta', text: '✕', onclick: () => { b.itens.splice(i, 1); sujar(); refazer(); } })),
          txt('Pergunta', it, 'p', { max: 250 }), rico(it, 'r', { compacto: true, ph: 'Resposta…' }))),
        h('button', { type: 'button', class: 'ce-mini', text: '+ Adicionar pergunta', onclick: () => { b.itens.push({ p: '', r: '' }); sujar(); refazer(); } }),
      ],
    },
    botao: {
      rot: 'Botão com link', desc: 'Botão para uma página, WhatsApp, planilha...', grupo: 2,
      novo: () => ({ t: 'botao', rotulo: '', url: '', estilo: 'primario' }),
      corpo: (b) => [linha(txt('Texto do botão', b, 'rotulo', { max: 80 }), sel('Estilo', b, 'estilo', [['primario', 'Dourado'], ['contorno', 'Contorno']])), txt('Link', b, 'url', { max: 500, ph: 'https://… ou /#contato' })],
    },
    divisor: {
      rot: 'Linha separadora', desc: 'Uma linha discreta para separar partes', grupo: 2,
      novo: () => ({ t: 'divisor' }),
      corpo: () => [h('p', { class: 'ce-dica', text: 'Uma linha fina separa o que vem antes do que vem depois.' })],
    },
    cta: {
      rot: 'Chamada para compra', desc: 'Faixa escura com preço e botão (usa o link de compra da publicação)', grupo: 3,
      novo: () => ({ t: 'cta', titulo: '', texto: '', rotulo: '', url: '', preco: true }),
      corpo: (b) => [
        txt('Título', b, 'titulo', { max: 160, ph: 'Pronto para organizar o caixa?' }),
        txt('Texto (opcional)', b, 'texto', { max: 400 }),
        linha(txt('Texto do botão (opcional)', b, 'rotulo', { max: 60 }), txt('Link (opcional)', b, 'url', { max: 500 })),
        h('p', { class: 'ce-dica', text: 'Em branco, o botão usa o texto e o link de compra preenchidos na coluna ao lado, em "Venda".' }),
        chk('Mostrar o preço', b, 'preco'),
      ],
    },
  };
  const GRUPOS = ['Texto e imagens', 'Planilhas, arquivos e painéis', 'Organização', 'Página de venda'];

  function corpoTabela(b, refazer) {
    const tabela = h('table', { class: 'ce-tab' });
    b.linhas.forEach((l, ri) => {
      const tr = h('tr', { class: b.cab && ri === 0 ? 'cab' : '' });
      l.forEach((c, ci) => {
        const inp = h('input', { type: 'text', value: c, 'aria-label': `Linha ${ri + 1}, coluna ${ci + 1}`, maxlength: '500' });
        inp.addEventListener('input', () => { b.linhas[ri][ci] = inp.value; sujar(); });
        tr.append(h('td', {}, inp));
      });
      tabela.append(tr);
    });
    const colunas = () => (b.linhas[0] || []).length;
    const colar = h('div', { hidden: true, class: 'ce-item' },
      h('p', { class: 'ce-dica', text: 'Copie as células no Excel ou Google Planilhas (Ctrl+C) e cole abaixo (Ctrl+V). Isso substitui a tabela atual.' }),
      h('textarea', { rows: 5, placeholder: 'Cole aqui…' }),
      h('div', { class: 'ce-tab-barra' },
        h('button', { type: 'button', class: 'ce-mini', text: 'Aplicar', onclick: () => {
          const novas = parseColado(colar.querySelector('textarea').value);
          if (!novas.length) { aviso('Nada para colar.', 'error'); return; }
          b.linhas = novas; sujar(); refazer();
        } }),
        h('button', { type: 'button', class: 'ce-mini', text: 'Cancelar', onclick: () => { colar.hidden = true; } })));
    return [
      h('div', { class: 'ce-tab-rolagem' }, tabela),
      h('div', { class: 'ce-tab-barra' },
        h('button', { type: 'button', class: 'ce-mini', text: '+ Linha', onclick: () => { b.linhas.push(Array(colunas()).fill('')); sujar(); refazer(); } }),
        h('button', { type: 'button', class: 'ce-mini', text: '+ Coluna', onclick: () => { if (colunas() >= 30) return; b.linhas.forEach((l) => l.push('')); sujar(); refazer(); } }),
        h('button', { type: 'button', class: 'ce-mini perigo', text: '− Linha', onclick: () => { if (b.linhas.length > 1) { b.linhas.pop(); sujar(); refazer(); } } }),
        h('button', { type: 'button', class: 'ce-mini perigo', text: '− Coluna', onclick: () => { if (colunas() > 1) { b.linhas.forEach((l) => l.pop()); sujar(); refazer(); } } }),
        h('button', { type: 'button', class: 'ce-mini', text: 'Colar da planilha', onclick: () => { colar.hidden = !colar.hidden; } })),
      colar,
      (() => { const c = h('input', { type: 'checkbox' }); c.checked = !!b.cab; c.addEventListener('change', () => { b.cab = c.checked; sujar(); refazer(); }); return h('label', { class: 'checkbox-label ce-check' }, c, ' A primeira linha é o cabeçalho'); })(),
      txt('Legenda (opcional)', b, 'legenda', { max: 300 }),
    ];
  }

  function parseColado(t) {
    let ls = String(t).replace(/\r/g, '').split('\n');
    while (ls.length && ls[ls.length - 1].trim() === '') ls.pop();
    if (!ls.length) return [];
    const sep = ls.some((l) => l.includes('\t')) ? '\t' : (ls.some((l) => l.includes(';')) ? ';' : ',');
    let m = ls.slice(0, 300).map((l) => l.split(sep).slice(0, 30).map((c) => c.trim().replace(/^"(.*)"$/, '$1')));
    const n = Math.max(...m.map((l) => l.length));
    m = m.map((l) => l.concat(Array(n - l.length).fill('')));
    return m;
  }

  /* ============================================================ lista de blocos */

  function entre(i, fim) {
    const caixa = h('div', { class: 'ce-entre' + (fim ? ' fim' : '') });
    const botao = h('button', { type: 'button', class: 'ce-entre-mais', text: fim ? '+ Adicionar bloco' : '+ Inserir bloco aqui', 'aria-expanded': 'false' });
    const paleta = h('div', { class: 'ce-paleta', hidden: true });
    botao.addEventListener('click', () => {
      const abrir = paleta.hidden;
      document.querySelectorAll('.ce-paleta').forEach((p) => { p.hidden = true; p.parentElement.classList.remove('aberto'); });
      if (abrir) {
        if (!paleta.childElementCount) montarPaleta(paleta, i);
        paleta.hidden = false;
        caixa.classList.add('aberto');
      }
      botao.setAttribute('aria-expanded', String(abrir));
    });
    caixa.append(h('div', { class: 'ce-entre-linha' }, botao), paleta);
    return caixa;
  }

  function montarPaleta(paleta, indice) {
    GRUPOS.forEach((g, gi) => {
      paleta.append(h('h4', { text: g }));
      paleta.append(h('div', { class: 'ce-paleta-grade' }, Object.entries(BLOCOS).filter(([, d]) => d.grupo === gi).map(([chave, d]) =>
        h('button', { type: 'button', class: 'ce-paleta-item', onclick: () => inserir(chave, indice) }, h('strong', { text: d.rot }), h('span', { text: d.desc })))));
    });
  }

  function inserir(chave, indice) {
    post.blocos.splice(indice, 0, BLOCOS[chave].novo());
    sujar();
    renderBlocos();
    const cartao = $('ceBlocos').querySelectorAll('.ce-bloco')[indice];
    if (cartao) {
      cartao.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const primeiro = cartao.querySelector('input:not([type=checkbox]):not([hidden]), textarea, [contenteditable]');
      if (primeiro) setTimeout(() => primeiro.focus({ preventScroll: true }), 250);
    }
  }

  function cartao(b, i) {
    const def = BLOCOS[b.t];
    const corpo = h('div', { class: 'ce-bloco-corpo' });
    const refazer = () => corpo.replaceChildren(...def.corpo(b, refazer).filter(Boolean));
    refazer();
    const mover = (d) => { const j = i + d; [post.blocos[i], post.blocos[j]] = [post.blocos[j], post.blocos[i]]; sujar(); renderBlocos(); $('ceBlocos').querySelectorAll('.ce-bloco')[j].scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
    return h('div', { class: 'ce-bloco', 'data-t': b.t },
      h('div', { class: 'ce-bloco-topo' },
        h('span', { class: 'ce-bloco-rot', text: def.rot }),
        h('button', { type: 'button', class: 'ce-ico', title: 'Subir', 'aria-label': 'Subir bloco', text: '↑', disabled: i === 0 || null, onclick: () => mover(-1) }),
        h('button', { type: 'button', class: 'ce-ico', title: 'Descer', 'aria-label': 'Descer bloco', text: '↓', disabled: i === post.blocos.length - 1 || null, onclick: () => mover(1) }),
        h('button', { type: 'button', class: 'ce-ico', title: 'Duplicar', 'aria-label': 'Duplicar bloco', text: '⧉', onclick: () => { post.blocos.splice(i + 1, 0, JSON.parse(JSON.stringify(b))); sujar(); renderBlocos(); } }),
        h('button', { type: 'button', class: 'ce-ico perigo', title: 'Remover', 'aria-label': 'Remover bloco', text: '✕', onclick: () => { if (confirm('Remover este bloco?')) { post.blocos.splice(i, 1); sujar(); renderBlocos(); } } })),
      corpo);
  }

  function renderBlocos() {
    const alvo = $('ceBlocos');
    alvo.replaceChildren();
    if (!post.blocos.length) alvo.append(h('div', { class: 'ce-vazio', text: 'Comece adicionando o primeiro bloco: texto, foto, planilha, painel…' }));
    post.blocos = post.blocos.filter((b) => b && BLOCOS[b.t]);
    post.blocos.forEach((b, i) => { alvo.append(entre(i), cartao(b, i)); });
    alvo.append(entre(post.blocos.length, true));
  }

  /* ============================================================ lateral */

  function desenharCapa() {
    const alvo = $('ceCapa');
    alvo.replaceChildren(campoFoto(post, 'capa', desenharCapa));
    if (post.capa) return;
    alvo.append(h('p', { class: 'admin-field-hint', text: 'Sem foto, o site desenha sozinho uma capa com a marca, a categoria e o título. É a imagem que aparece quando o link é compartilhado.' }));
    if (post.id && post.slug && situacao() === 'Publicado') { // só publicadas têm capa provisória pública
      alvo.append(h('img', { class: 'ce-capa-auto', src: `/conteudos/capa/${encodeURIComponent(post.slug)}.png?v=${Date.now()}`, alt: 'Capa provisória desenhada pelo site', loading: 'lazy' }));
    }
  }

  function situacao() {
    if (post.status !== 'publicado') return 'Rascunho';
    return post.publicadoEm && new Date(post.publicadoEm) > new Date() ? 'Agendado' : 'Publicado';
  }

  function atualizarSituacao() {
    const s = situacao();
    const chip = $('ceSituacao');
    chip.textContent = s;
    chip.className = 'ce-chip' + (s === 'Publicado' ? ' pub' : s === 'Agendado' ? ' agenda' : '');
    const futuro = post.publicadoEm && new Date(post.publicadoEm) > new Date();
    const dataTxt = post.publicadoEm ? new Date(post.publicadoEm).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' }) : '';
    $('ceSituacaoTxt').textContent = s === 'Publicado' ? `No ar desde ${dataTxt}.` : s === 'Agendado' ? `Entra no ar em ${dataTxt}.` : (futuro ? `Se publicar agora, entra no ar em ${dataTxt}.` : 'Ainda não está no site.');
    if (post.status === 'publicado') {
      $('btnRascunho').textContent = 'Voltar para rascunho';
      $('btnPublicar').textContent = 'Salvar alterações';
    } else {
      $('btnRascunho').textContent = 'Salvar rascunho';
      $('btnPublicar').textContent = futuro ? 'Agendar publicação' : 'Publicar';
    }
    const ver = $('ceVerNoSite');
    ver.hidden = !(post.id && s === 'Publicado' && post.url);
    if (!ver.hidden) ver.href = post.url;
  }

  function aplicarTipo() {
    const venda = post.tipo === 'infoproduto';
    document.querySelectorAll('#ceTipo button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.tipo === post.tipo)));
    $('ceCxVenda').hidden = !venda;
    $('ceTipoAjuda').textContent = venda
      ? 'Página de venda: aparece junto dos infoprodutos na página inicial, com preço e botão de compra.'
      : 'Conteúdo: aparece na seção "Conteúdos" da página inicial e em /conteudos/.';
    $('ceSlugAjuda').textContent = `Endereço final: ${venda ? '/infoprodutos/' : '/conteudos/'}${post.slug || 'titulo-da-publicacao'}`;
    $('ceRotuloTopo').textContent = post.titulo || (venda ? 'Nova página de venda' : 'Novo conteúdo');
    document.title = `${post.titulo || 'Nova publicação'} | Editor`;
  }

  function ligar(id, chave, o = {}) {
    const el = $(id);
    el.value = o.ler ? o.ler(post[chave]) : (post[chave] ?? '');
    el.addEventListener('input', () => { post[chave] = o.gravar ? o.gravar(el.value) : el.value; sujar(); if (o.ao) o.ao(); });
  }

  function montarLateral() {
    $('ceTitulo').value = post.titulo;
    $('ceTitulo').addEventListener('input', (e) => { post.titulo = e.target.value; sujar(); aplicarTipo(); });
    ligar('cePreco', 'precoLabel');
    ligar('ceLink', 'linkCompra');
    ligar('ceCtaRotulo', 'ctaRotulo');
    ligar('ceSlug', 'slug', { ao: aplicarTipo });
    ligar('cePublicadoEm', 'publicadoEm', { ler: paraInputLocal, gravar: (v) => (v ? new Date(v).toISOString() : ''), ao: atualizarSituacao });
    ligar('ceCapaAlt', 'capaAlt');
    ligar('ceResumo', 'resumo');
    ligar('ceCategoria', 'categoria');
    ligar('ceTags', 'tags');
    ligar('ceAutor', 'autor');
    ligar('ceSeo', 'seoDescricao');
    $('ceGratuito').checked = post.gratuito;
    $('ceGratuito').addEventListener('change', (e) => { post.gratuito = e.target.checked; sujar(); });
    document.querySelectorAll('#ceTipo button').forEach((b) => b.addEventListener('click', () => { post.tipo = b.dataset.tipo; sujar(); aplicarTipo(); }));
    desenharCapa();
    aplicarTipo();
    atualizarSituacao();
  }

  async function carregarCategorias() {
    try {
      const lista = await api('/api/admin/posts');
      const cats = [...new Set(lista.map((p) => p.categoria).filter(Boolean))].sort();
      $('ceCategorias').replaceChildren(...cats.map((c) => h('option', { value: c })));
    } catch { /* só sugestão */ }
  }

  /* ============================================================ salvar */

  function corpoParaEnvio(status) {
    return {
      id: post.id, tipo: post.tipo, titulo: post.titulo.trim(), slug: post.slug.trim(), resumo: post.resumo, capa: post.capa, capaAlt: post.capaAlt, categoria: post.categoria,
      tags: post.tags, status, publicadoEm: post.publicadoEm || '', seoDescricao: post.seoDescricao, autor: post.autor, precoLabel: post.precoLabel, gratuito: post.gratuito,
      linkCompra: post.linkCompra, ctaRotulo: post.ctaRotulo, blocos: post.blocos,
    };
  }

  let salvando = false;
  async function salvar(status) {
    if (salvando) return;
    if (!post.titulo.trim()) { aviso('Informe o título da publicação.', 'error'); $('ceTitulo').focus(); return; }
    if (status === 'rascunho' && post.status === 'publicado' && !confirm('A página sai do ar e volta a ser rascunho. Continuar?')) return;
    salvando = true;
    document.querySelectorAll('.ce-topo button').forEach((b) => { b.disabled = true; });
    aviso('Salvando…');
    try {
      const r = await api('/api/admin/post', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpoParaEnvio(status)) });
      const blocosAntes = post.blocos;
      const jsonAntes = JSON.stringify(blocosAntes);
      carregarNoEstado(r);
      if (JSON.stringify(post.blocos) === jsonAntes) post.blocos = blocosAntes; // os campos da tela continuam ligados a estes objetos
      else renderBlocos();
      desenharCapa();
      $('ceSlug').value = post.slug;
      $('cePublicadoEm').value = paraInputLocal(post.publicadoEm);
      if (location.search.indexOf('id=') === -1) history.replaceState(null, '', `conteudo.html?id=${encodeURIComponent(post.id)}`);
      limpar();
      aplicarTipo();
      atualizarSituacao();
      aviso(status === 'publicado' ? (situacao() === 'Agendado' ? 'Agendado.' : 'Publicado.') : 'Rascunho salvo.', 'success');
    } catch (err) {
      aviso(err.message, 'error');
    } finally {
      salvando = false;
      document.querySelectorAll('.ce-topo button').forEach((b) => { b.disabled = false; });
    }
  }

  $('btnRascunho').addEventListener('click', () => salvar('rascunho'));
  $('btnPublicar').addEventListener('click', () => salvar('publicado'));
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !editorApp.hidden) { e.preventDefault(); salvar(post.status === 'publicado' ? 'publicado' : 'rascunho'); }
    if (e.key === 'Escape' && !$('previa').hidden) fecharPrevia();
  });

  /* ============================================================ pré-visualização (mesmo CSS e mesmo HTML do site) */

  async function abrirPrevia() {
    aviso('Montando a pré-visualização…');
    try {
      const r = await api('/api/admin/post-preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocos: post.blocos, gratuito: post.gratuito, linkCompra: post.linkCompra, ctaRotulo: post.ctaRotulo, precoLabel: post.precoLabel }),
      });
      $('previaFrame').srcdoc = documentoPrevia(r);
      $('previa').hidden = false;
      aviso('');
    } catch (err) {
      aviso(err.message, 'error');
    }
  }
  function fecharPrevia() { $('previa').hidden = true; $('previaFrame').srcdoc = ''; }

  function documentoPrevia(r) {
    const venda = post.tipo === 'infoproduto';
    const titulo = esc(post.titulo || 'Título da publicação');
    const preco = post.gratuito ? 'Grátis' : esc(post.precoLabel);
    const rotulo = esc(post.ctaRotulo || (post.gratuito ? 'Baixar grátis' : 'Comprar agora'));
    const capa = post.capa ? esc(post.capa) : '';
    const corpo = venda
      ? `<section class="venda-hero"><div class="container venda-grid"><div class="venda-txt"><p class="eyebrow">${esc(post.categoria || 'Infoproduto')}</p><h1>${titulo}</h1>
          ${post.resumo ? `<p class="venda-resumo">${esc(post.resumo)}</p>` : ''}<div class="venda-compra">${preco ? `<span class="venda-preco${post.gratuito ? ' gratis' : ''}">${preco}</span>` : ''}<a class="btn btn-primary btn-grande" href="#">${rotulo}</a></div></div>
          ${capa ? `<figure class="venda-capa"><img src="${capa}" alt=""></figure>` : ''}</div></section><article class="art-body venda-corpo">${r.html}</article>`
      : `<article class="art"><header class="art-topo container"><h1>${titulo}</h1>${post.resumo ? `<p class="art-resumo">${esc(post.resumo)}</p>` : ''}
          <p class="art-meta"><span>${esc(post.autor || 'CM Soluções Financeiras')}</span><span>Pré-visualização</span></p></header>
          ${capa ? `<figure class="art-capa container"><img src="${capa}" alt=""></figure>` : ''}<div class="art-body">${r.html}</div></article>`;
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base target="_blank">
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
      <link rel="stylesheet" href="/assets/css/style.css?v=7"><link rel="stylesheet" href="/assets/css/conteudos.css?v=4">${r.precisaPainel ? '<link rel="stylesheet" href="/assets/css/dashboard.css?v=5">' : ''}</head>
      <body class="home pg-cont ${venda ? 'pg-venda' : 'pg-artigo'}">${corpo}${r.precisaPainel ? '<script src="/assets/js/dashboard.js?v=4"><\/script>' : ''}<script src="/assets/js/conteudos.js?v=1"><\/script></body></html>`;
  }

  $('btnPrevia').addEventListener('click', abrirPrevia);
  $('previaFechar').addEventListener('click', fecharPrevia);
  $('previaLargura').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    $('previaLargura').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    $('previaFrame').style.width = b.dataset.w;
  });

  /* ============================================================ entrada */

  function mostrarErro(msg) {
    loginScreen.hidden = true;
    editorApp.hidden = true;
    const e = $('erroInicial');
    e.hidden = false;
    e.replaceChildren(h('p', { text: msg }), h('p', {}, h('a', { class: 'btn btn-ghost btn-sm', href: 'index.html', text: '← Voltar ao painel' })));
  }

  function sair() {
    limparSessaoSalva();
    authHeader = '';
    editorApp.hidden = true;
    loginScreen.hidden = false;
  }

  async function iniciar() {
    loginScreen.hidden = true;
    $('erroInicial').hidden = true;
    const p = new URLSearchParams(location.search);
    const id = p.get('id');
    let escolher = false;
    try {
      if (id) {
        carregarNoEstado(await api(`/api/admin/post?id=${encodeURIComponent(id)}`));
      } else {
        post = novoPost();
        const t = p.get('tipo');
        if (t === 'blog' || t === 'infoproduto') post.tipo = t; else escolher = true;
      }
    } catch (err) {
      mostrarErro(err.message);
      return;
    }
    editorApp.hidden = false;
    montarLateral();
    renderBlocos();
    carregarCategorias();
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* navegador sem suporte */ }
    if (escolher) $('modalTipo').hidden = false;
  }

  document.querySelectorAll('#modalTipo [data-tipo]').forEach((b) => b.addEventListener('click', () => {
    post.tipo = b.dataset.tipo;
    $('modalTipo').hidden = true;
    aplicarTipo();
    $('ceTitulo').focus();
  }));

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('btnEntrar');
    const fb = $('loginFeedback');
    btn.disabled = true;
    fb.textContent = 'Verificando...';
    fb.className = 'admin-feedback';
    const tentativa = `Basic ${btoa(`${$('userInput').value.trim()}:${$('passInput').value}`)}`; // igual às outras telas do painel
    try {
      const res = await fetch(`${API}/api/login`, { headers: { Authorization: tentativa } });
      if (res.status === 401) throw new Error('Usuário ou senha inválidos.');
      if (!res.ok) throw new Error(`Não foi possível falar com o servidor (HTTP ${res.status}).`);
      const dados = await res.json().catch(() => ({}));
      if (dados.papel && dados.papel !== 'admin') throw new Error('Este acesso não tem permissão para editar publicações.');
      authHeader = tentativa;
      const arm = $('manterConectado').checked ? localStorage : sessionStorage;
      arm.setItem('cm_admin_auth', authHeader);
      arm.setItem('cm_admin_papel', dados.papel || 'admin');
      await iniciar();
    } catch (err) {
      fb.textContent = err instanceof TypeError ? `Não foi possível conectar ao servidor (${err.message}).` : err.message;
      fb.className = 'admin-feedback error';
    } finally {
      btn.disabled = false;
    }
  });

  if (authHeader) {
    fetch(`${API}/api/login`, { headers: { Authorization: authHeader } })
      .then(async (res) => {
        const dados = await res.json().catch(() => ({}));
        if (!res.ok || (dados.papel && dados.papel !== 'admin')) { limparSessaoSalva(); authHeader = ''; return; }
        iniciar();
      })
      .catch(() => {});
  }
})();
