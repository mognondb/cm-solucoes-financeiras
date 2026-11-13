document.getElementById('ano').textContent = new Date().getFullYear();

// Mobile nav toggle
const header = document.querySelector('.site-header');
const navToggle = document.getElementById('navToggle');
navToggle.addEventListener('click', () => {
  const isOpen = header.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', String(isOpen));
});
document.getElementById('nav').addEventListener('click', (e) => {
  if (e.target.tagName === 'A') header.classList.remove('open');
});

// "Quero esse produto/serviço" (cards) e CTAs avulsos -> scroll ao form e preselect do interesse
function preencherInteresse(interesse) {
  const select = document.getElementById('interesse');
  if (interesse && select) {
    const option = Array.from(select.options).find((o) => o.value === interesse);
    if (option) select.value = interesse;
  }
  document.getElementById('contato').scrollIntoView({ behavior: 'smooth' });
  document.getElementById('nome')?.focus({ preventScroll: true });
}

function ativarInteresseCards() {
  document.querySelectorAll('.card-btn:not(.btn-comprar)').forEach((btn) => {
    if (btn.tagName !== 'BUTTON') return;
    if (btn.dataset.interesseBound) return;
    btn.dataset.interesseBound = 'true';
    btn.addEventListener('click', () => {
      const card = btn.closest('.card');
      preencherInteresse(card?.dataset.interesse);
    });
  });
}

document.querySelectorAll('[data-interesse]:not(.card)').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    preencherInteresse(el.dataset.interesse);
  });
});

ativarInteresseCards();

// Escapa texto vindo dos arquivos de dados antes de inserir via innerHTML
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// API própria do site (PHP + MySQL na Hostinger, mesma origem). O site busca
// os dados mais recentes ali (infoprodutos e o formulário de Diagnóstico
// Financeiro); se a chamada de infoprodutos falhar, cai de volta para o
// arquivo estático em assets/data/. Veja admin/README-servidor.md.
const ADMIN_API_URL = '';

async function buscarDados(tipo, caminhoLocal) {
  try {
    const res = await fetch(`${ADMIN_API_URL}/api/file?path=${tipo}`, { cache: 'no-store' });
    if (res.ok) return res.json();
  } catch {
    // segue para o fallback local
  }
  const res = await fetch(caminhoLocal, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Falha ao buscar ${caminhoLocal}`);
  return res.json();
}

// Páginas publicadas pelo painel (conteúdos e páginas de venda de infoprodutos).
// Falha em silêncio: se a API não responder, o site segue sem essas partes.
async function buscarPosts(tipo, limite) {
  try {
    const res = await fetch(`${ADMIN_API_URL}/api/posts?tipo=${tipo}&limite=${limite}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const dados = await res.json();
    return Array.isArray(dados.posts) ? dados.posts : [];
  } catch {
    return [];
  }
}

function dataLonga(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
}

// Cartão do conteúdo mais recente (mesmo visual da lista em /conteudos/)
function cartaoConteudo(p) {
  const capa = p.capa
    ? `<img src="${escapeHtml(p.capa)}" alt="${escapeHtml(p.capaAlt || p.titulo)}" loading="lazy" decoding="async">`
    : `<span class="c-capa-vazia" aria-hidden="true">${escapeHtml((p.categoria || 'CM').toUpperCase().slice(0, 22))}</span>`;
  const meta = [
    p.categoria ? `<span class="c-categoria">${escapeHtml(p.categoria)}</span>` : '',
    p.publicadoEm ? `<span>${escapeHtml(dataLonga(p.publicadoEm))}</span>` : '',
    `<span>${Number(p.tempoLeitura) || 1} min de leitura</span>`,
  ].join('');
  return `
    <a class="c-card c-destaque" href="${escapeHtml(p.url)}">
      <span class="c-capa">${capa}</span>
      <span class="c-corpo">
        <span class="c-meta">${meta}</span>
        <strong class="c-titulo">${escapeHtml(p.titulo)}</strong>
        ${p.resumo ? `<span class="c-resumo">${escapeHtml(p.resumo)}</span>` : ''}
        <span class="c-ler">Ler conteúdo <span aria-hidden="true">→</span></span>
      </span>
    </a>`;
}

async function carregarUltimoConteudo() {
  const secao = document.getElementById('conteudos');
  if (!secao) return;
  const [ultimo] = await buscarPosts('blog', 1);
  if (!ultimo) return; // sem publicações: a seção e os links ficam escondidos
  document.getElementById('conteudoDestaque').innerHTML = cartaoConteudo(ultimo);
  secao.hidden = false;
  document.querySelectorAll('[data-conteudos-link]').forEach((a) => { a.hidden = false; });
}

carregarUltimoConteudo();

// Infoprodutos: os cadastrados direto no painel (lista simples) e, logo depois,
// as páginas de venda criadas no editor de Conteúdos com o tipo "Infoproduto".
async function carregarInfoprodutos() {
  const grid = document.getElementById('infoprodutosGrid');
  if (!grid) return;
  try {
    const [dados, paginas] = await Promise.all([
      buscarDados('infoprodutos', 'assets/data/infoprodutos.json'),
      buscarPosts('infoproduto', 50),
    ]);
    const itens = dados.filter((item) => item.ativo !== false);

    if (itens.length === 0 && paginas.length === 0) {
      grid.innerHTML = '<p class="loading-placeholder">Nenhum produto disponível no momento.</p>';
      return;
    }

    const cartoesLista = itens.map((item) => {
      const gratis = item.tipo === 'gratis';
      const badgeClass = gratis ? 'badge-free' : 'badge-paid';
      const badgeTexto = gratis ? 'Grátis' : escapeHtml(item.precoLabel || '');
      const botao = gratis
        ? `<a href="${escapeHtml(item.link)}" class="btn btn-outline card-btn" download>Baixar grátis</a>`
        : `<a href="${escapeHtml(item.link)}" class="btn btn-primary card-btn" target="_blank" rel="noopener">Comprar agora</a>`;

      return `
        <div class="card card-info">
          <span class="badge ${badgeClass}">${badgeTexto}</span>
          <h3>${escapeHtml(item.nome)}</h3>
          <p>${escapeHtml(item.descricao)}</p>
          ${botao}
        </div>`;
    });

    const cartoesPagina = paginas.map((p) => {
      const badgeClass = p.gratuito ? 'badge-free' : 'badge-paid';
      const badgeTexto = p.gratuito ? 'Grátis' : escapeHtml(p.precoLabel || '');
      const capa = p.capa ? `<a class="card-capa" href="${escapeHtml(p.url)}" tabindex="-1" aria-hidden="true"><img src="${escapeHtml(p.capa)}" alt="" loading="lazy" decoding="async"></a>` : '';
      return `
        <div class="card ${p.capa ? 'card-pagina' : 'card-info'}">
          ${badgeTexto ? `<span class="badge ${badgeClass}">${badgeTexto}</span>` : ''}
          ${capa}
          <div class="${p.capa ? 'card-corpo' : 'card-corpo-simples'}">
            <h3>${escapeHtml(p.titulo)}</h3>
            <p>${escapeHtml(p.resumo)}</p>
            <a href="${escapeHtml(p.url)}" class="btn ${p.gratuito ? 'btn-outline' : 'btn-primary'} card-btn">Ver detalhes</a>
          </div>
        </div>`;
    });

    grid.innerHTML = [...cartoesLista, ...cartoesPagina].join('');
  } catch (err) {
    grid.innerHTML = '<p class="loading-placeholder">Não foi possível carregar os produtos agora.</p>';
  }
}

carregarInfoprodutos();

// Formulário de contato/relatório via Formspree (ou similar)
const form = document.getElementById('formRelatorio');
const feedback = document.getElementById('formFeedback');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  feedback.textContent = '';
  feedback.className = 'form-feedback';

  const actionUrl = form.getAttribute('action');
  if (!actionUrl || actionUrl.includes('SEU_FORM_ID')) {
    feedback.textContent = 'Formulário ainda não configurado: defina o endpoint de envio (ex.: Formspree) no atributo action do form.';
    feedback.classList.add('error');
    return;
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Enviando...';

  try {
    const response = await fetch(actionUrl, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' },
    });

    if (response.ok) {
      feedback.textContent = 'Solicitação enviada com sucesso! Em breve entraremos em contato.';
      feedback.classList.add('success');
      form.reset();
    } else {
      throw new Error('Falha no envio');
    }
  } catch (err) {
    feedback.textContent = 'Não foi possível enviar agora. Tente novamente em instantes.';
    feedback.classList.add('error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Enviar solicitação';
  }
});

// Modal + formulário do Diagnóstico Financeiro
const modalDiagnostico = document.getElementById('modalDiagnostico');
const formDiagnostico = document.getElementById('formDiagnostico');
const diagnosticoFeedback = document.getElementById('diagnosticoFeedback');

function abrirModalDiagnostico() {
  if (!modalDiagnostico) return;
  modalDiagnostico.hidden = false;
  document.getElementById('dNome')?.focus();
}
function fecharModalDiagnostico() {
  if (!modalDiagnostico) return;
  modalDiagnostico.hidden = true;
}

document.querySelectorAll('[data-abrir-diagnostico]').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    abrirModalDiagnostico();
  });
});
document.getElementById('btnFecharDiagnostico')?.addEventListener('click', fecharModalDiagnostico);
modalDiagnostico?.addEventListener('click', (e) => {
  if (e.target === modalDiagnostico) fecharModalDiagnostico();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalDiagnostico && !modalDiagnostico.hidden) fecharModalDiagnostico();
});

if (formDiagnostico) {
  formDiagnostico.addEventListener('submit', async (e) => {
    e.preventDefault();
    diagnosticoFeedback.textContent = '';
    diagnosticoFeedback.className = 'form-feedback';

    const dados = Object.fromEntries(new FormData(formDiagnostico).entries());
    if (dados.website) {
      // campo-armadilha preenchido: provavelmente um bot — finge sucesso, não envia nada.
      diagnosticoFeedback.textContent = 'Diagnóstico enviado! Em breve entraremos em contato.';
      diagnosticoFeedback.classList.add('success');
      formDiagnostico.reset();
      setTimeout(fecharModalDiagnostico, 1800);
      return;
    }

    const btn = formDiagnostico.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Enviando...';

    try {
      const res = await fetch(`${ADMIN_API_URL}/api/diagnostico`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Não foi possível enviar agora.');

      diagnosticoFeedback.textContent = 'Diagnóstico enviado! Em breve entraremos em contato.';
      diagnosticoFeedback.classList.add('success');
      formDiagnostico.reset();
      setTimeout(fecharModalDiagnostico, 1800);
    } catch (err) {
      diagnosticoFeedback.textContent = err instanceof TypeError
        ? 'Não foi possível conectar ao servidor agora. Tente novamente em instantes.'
        : err.message;
      diagnosticoFeedback.classList.add('error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Enviar diagnóstico';
    }
  });
}
