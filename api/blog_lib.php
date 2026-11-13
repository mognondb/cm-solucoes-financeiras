<?php
/**
 * Biblioteca do blog: tabela de posts, sanitização do texto, normalização e renderização dos blocos.
 *
 * Usada por três lugares, para que o post saia igual em todos eles:
 *   - api/blog_routes.php  (API: CRUD no painel, upload, pré-visualização)
 *   - blog/*.php           (páginas públicas, renderizadas no servidor: bom para busca e para a prévia do link)
 *
 * Um post é uma lista de BLOCOS (texto, imagem, galeria, arquivo, tabela, incorporar, destaque, fórmula,
 * passos, botão, divisor, painel). Tudo que vem do editor é revalidado aqui antes de ser salvo, e escapado
 * de novo na hora de mostrar: nenhum HTML "cru" chega à página.
 */
declare(strict_types=1);

const BLOG_EXT_IMAGEM = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const BLOG_EXT_ARQUIVO = ['pdf', 'xlsx', 'xls', 'xlsm', 'xlsb', 'csv', 'ods', 'docx', 'doc', 'odt', 'pptx', 'ppt', 'zip', 'pbix', 'pbit', 'txt', 'json'];
const BLOG_MAX_UPLOAD = 25 * 1024 * 1024;
const BLOG_MAX_BLOCOS = 200;
const BLOG_RESERVADOS = ['index', 'post', 'sitemap', 'feed', 'admin', 'api'];
/** Nome que aparece para o visitante (menu, títulos, rodapé). "Blog" é só o nome interno do código. */
const BLOG_NOME_PUBLICO = 'Conteúdos';

/* ====================================================================== banco */

function blogMigrar(PDO $db): void {
  static $feito = false;
  if ($feito) return;
  $db->exec('CREATE TABLE IF NOT EXISTS posts (
    id VARCHAR(40) PRIMARY KEY,
    tipo VARCHAR(20) NOT NULL DEFAULT \'blog\',
    slug VARCHAR(160) NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    resumo TEXT NULL,
    capa VARCHAR(500) NULL,
    capa_alt VARCHAR(255) NULL,
    categoria VARCHAR(80) NULL,
    tags VARCHAR(255) NULL,
    status VARCHAR(20) NOT NULL DEFAULT \'rascunho\',
    publicado_em VARCHAR(32) NULL,
    seo_descricao VARCHAR(300) NULL,
    autor VARCHAR(120) NULL,
    preco_label VARCHAR(60) NULL,
    gratuito TINYINT(1) NOT NULL DEFAULT 0,
    link_compra VARCHAR(500) NULL,
    cta_rotulo VARCHAR(60) NULL,
    blocos_json LONGTEXT NOT NULL,
    criado_em VARCHAR(32) NOT NULL,
    atualizado_em VARCHAR(32) NOT NULL,
    UNIQUE KEY uq_posts_slug (slug),
    INDEX idx_posts_pub (tipo, status, publicado_em)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
  $feito = true;
}

/* ====================================================================== utilidades */

function blogEsc($s): string {
  return htmlspecialchars((string)($s ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function blogCortar($s, int $max): string {
  $s = trim((string)($s ?? ''));
  return mb_strlen($s) > $max ? mb_substr($s, 0, $max) : $s;
}

function blogSlug(string $str): string {
  $str = trim($str);
  if (class_exists('Transliterator')) {
    $t = Transliterator::create('Any-Latin; Latin-ASCII');
    if ($t) $str = $t->transliterate($str);
  } else {
    $str = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $str) ?: $str;
  }
  $str = strtolower($str);
  $str = preg_replace('/[^a-z0-9]+/', '-', $str);
  return trim((string)$str, '-');
}

/** Só deixa passar endereços seguros: https/http, mailto, tel, caminho do próprio site e âncora. */
function blogUrl($u, bool $soMidia = false): string {
  $u = trim((string)($u ?? ''));
  if ($u === '' || preg_match('/[\x00-\x1f\s<>"\']/u', $u)) return '';
  if (preg_match('~^https?://[^/\s]+~i', $u)) return $u;
  if (!$soMidia && preg_match('~^(mailto:[^\s@]+@[^\s@]+|tel:[+0-9 ()-]+)$~i', $u)) return $u;
  if (!$soMidia && $u[0] === '#') return $u;
  if ($u[0] === '/' && substr($u, 0, 2) !== '//' && strpos($u, '..') === false) return $u;
  return '';
}

function blogUrlExterna(string $u): bool {
  return (bool)preg_match('~^https?://~i', $u);
}

const BLOG_MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function blogData(?string $iso): string {
  if (!$iso) return '';
  $t = strtotime($iso);
  if (!$t) return '';
  $d = new DateTimeImmutable('@' . $t);
  $d = $d->setTimezone(new DateTimeZone('America/Sao_Paulo'));
  return (int)$d->format('j') . ' de ' . BLOG_MESES[(int)$d->format('n') - 1] . ' de ' . $d->format('Y');
}

function blogBytes(int $n): string {
  if ($n >= 1048576) return number_format($n / 1048576, 1, ',', '.') . ' MB';
  if ($n >= 1024) return number_format($n / 1024, 0, ',', '.') . ' KB';
  return $n . ' B';
}

/* ====================================================================== sanitização do texto */

/** Tira todo HTML que não seja formatação simples de texto. Mantém: p, h2-h4, strong, em, u, ul, ol, li, blockquote, a, code, br. */
function blogLimparHtml($html, int $max = 60000): string {
  $html = trim((string)($html ?? ''));
  if ($html === '') return '';
  $html = mb_substr($html, 0, $max);

  $permitidas = ['p', 'br', 'strong', 'em', 'u', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'a', 'code'];
  $renomear = ['b' => 'strong', 'i' => 'em', 'div' => 'p', 'h1' => 'h2', 'h5' => 'h4', 'h6' => 'h4'];
  $descartar = ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea', 'link', 'meta', 'svg', 'math', 'noscript', 'template', 'head', 'title'];
  $inline = ['strong', 'em', 'u', 'a', 'code', 'br'];

  $dom = new DOMDocument('1.0', 'UTF-8');
  $prev = libxml_use_internal_errors(true);
  $dom->loadHTML('<?xml encoding="UTF-8"><div>' . $html . '</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
  libxml_clear_errors();
  libxml_use_internal_errors($prev);
  $raiz = $dom->getElementsByTagName('div')->item(0);
  if (!$raiz) return '';

  $limpar = function (DOMNode $no) use (&$limpar, $dom, $permitidas, $renomear, $descartar): void {
    foreach (iterator_to_array($no->childNodes) as $f) {
      if ($f->nodeType === XML_COMMENT_NODE || $f->nodeType === XML_PI_NODE || $f->nodeType === XML_CDATA_SECTION_NODE) { $no->removeChild($f); continue; }
      if ($f->nodeType !== XML_ELEMENT_NODE) continue;
      $tag = strtolower($f->nodeName);
      if (in_array($tag, $descartar, true)) { $no->removeChild($f); continue; }
      if (isset($renomear[$tag])) {
        $novo = $dom->createElement($renomear[$tag]);
        while ($f->firstChild) $novo->appendChild($f->firstChild);
        $no->replaceChild($novo, $f);
        $f = $novo; $tag = $novo->nodeName;
      }
      $limpar($f);
      if (!in_array($tag, $permitidas, true)) { // tag desconhecida: fica só o conteúdo
        while ($f->firstChild) $no->insertBefore($f->firstChild, $f);
        $no->removeChild($f);
        continue;
      }
      $href = $tag === 'a' ? $f->getAttribute('href') : '';
      foreach (iterator_to_array($f->attributes ?? []) as $at) $f->removeAttributeNode($at);
      if ($tag === 'a') {
        $ok = blogUrl($href);
        if ($ok === '') { while ($f->firstChild) $no->insertBefore($f->firstChild, $f); $no->removeChild($f); continue; }
        $f->setAttribute('href', $ok);
        if (blogUrlExterna($ok)) { $f->setAttribute('target', '_blank'); $f->setAttribute('rel', 'noopener noreferrer'); }
      }
    }
  };
  $limpar($raiz);

  // texto solto na raiz (o editor às vezes deixa) vira parágrafo; blocos ficam como estão
  $saida = '';
  $buffer = '';
  $descarrega = function () use (&$saida, &$buffer): void {
    if (trim(strip_tags($buffer)) !== '' || stripos($buffer, '<br') !== false && trim(strip_tags(str_ireplace('<br>', '', $buffer))) !== '') $saida .= '<p>' . trim($buffer) . '</p>';
    $buffer = '';
  };
  foreach ($raiz->childNodes as $f) {
    $nome = $f->nodeType === XML_ELEMENT_NODE ? strtolower($f->nodeName) : '#texto';
    $html1 = $dom->saveHTML($f);
    if ($nome === '#texto' || in_array($nome, $inline, true)) { $buffer .= $html1; continue; }
    $descarrega();
    if ($nome === 'p' && trim(str_ireplace(['<br>', '&nbsp;', "\xC2\xA0", ' '], '', strip_tags($html1))) === '') continue; // parágrafo vazio
    $saida .= $html1;
  }
  $descarrega();
  return trim($saida);
}

function blogTextoPlano($html): string {
  $t = html_entity_decode(strip_tags(str_replace(['</p>', '</li>', '<br>', '<br/>', '</h2>', '</h3>', '</h4>', '</blockquote>'], ' ', (string)$html)), ENT_QUOTES | ENT_HTML5, 'UTF-8');
  return trim(preg_replace('/\s+/u', ' ', $t) ?? '');
}

/* ====================================================================== blocos: normalização */

/** Valida e limpa a lista de blocos vinda do editor. Blocos inválidos são descartados; o resto é reescrito só com campos conhecidos. */
function blogNormalizarBlocos($blocos): array {
  if (!is_array($blocos)) return [];
  $out = [];
  foreach (array_slice(array_values($blocos), 0, BLOG_MAX_BLOCOS) as $b) {
    if (!is_array($b)) continue;
    $t = (string)($b['t'] ?? '');
    switch ($t) {
      case 'texto':
        $h = blogLimparHtml($b['html'] ?? '');
        if ($h !== '') $out[] = ['t' => 'texto', 'html' => $h];
        break;

      case 'imagem':
        $u = blogUrl($b['url'] ?? '', true);
        if ($u === '') break;
        $larg = in_array($b['largura'] ?? '', ['normal', 'larga', 'cheia'], true) ? $b['largura'] : 'normal';
        $out[] = ['t' => 'imagem', 'url' => $u, 'alt' => blogCortar($b['alt'] ?? '', 200), 'legenda' => blogCortar($b['legenda'] ?? '', 300), 'largura' => $larg,
                  'w' => max(0, (int)($b['w'] ?? 0)), 'h' => max(0, (int)($b['h'] ?? 0))];
        break;

      case 'galeria':
        $itens = [];
        foreach (array_slice((array)($b['itens'] ?? []), 0, 24) as $it) {
          if (!is_array($it)) continue;
          $u = blogUrl($it['url'] ?? '', true);
          if ($u !== '') $itens[] = ['url' => $u, 'alt' => blogCortar($it['alt'] ?? '', 200), 'legenda' => blogCortar($it['legenda'] ?? '', 200)];
        }
        if ($itens) $out[] = ['t' => 'galeria', 'colunas' => in_array((int)($b['colunas'] ?? 3), [2, 3, 4], true) ? (int)$b['colunas'] : 3, 'itens' => $itens];
        break;

      case 'arquivo':
        $u = blogUrl($b['url'] ?? '', true);
        if ($u === '') break;
        $ext = strtolower(pathinfo(parse_url($u, PHP_URL_PATH) ?: '', PATHINFO_EXTENSION));
        $out[] = ['t' => 'arquivo', 'url' => $u, 'nome' => blogCortar($b['nome'] ?? '', 160) ?: 'Arquivo', 'descricao' => blogCortar($b['descricao'] ?? '', 300),
                  'ext' => preg_match('/^[a-z0-9]{1,6}$/', (string)($b['ext'] ?? $ext)) ? strtolower((string)($b['ext'] ?? $ext)) : $ext, 'tamanho' => max(0, (int)($b['tamanho'] ?? 0))];
        break;

      case 'tabela':
        $linhas = [];
        foreach (array_slice((array)($b['linhas'] ?? []), 0, 300) as $l) {
          if (!is_array($l)) continue;
          $linhas[] = array_map(fn($c) => blogCortar($c, 500), array_slice(array_values($l), 0, 30));
        }
        if (!$linhas) break;
        $n = max(array_map('count', $linhas));
        foreach ($linhas as &$l) $l = array_pad($l, $n, '');
        unset($l);
        $out[] = ['t' => 'tabela', 'cab' => ($b['cab'] ?? true) !== false, 'linhas' => $linhas, 'legenda' => blogCortar($b['legenda'] ?? '', 300)];
        break;

      case 'incorporar':
        $u = blogUrl($b['url'] ?? '', true);
        if ($u === '' || !blogUrlExterna($u)) break;
        $out[] = ['t' => 'incorporar', 'url' => $u, 'titulo' => blogCortar($b['titulo'] ?? '', 160), 'legenda' => blogCortar($b['legenda'] ?? '', 300),
                  'altura' => min(1400, max(200, (int)($b['altura'] ?? 520)))];
        break;

      case 'destaque':
        $h = blogLimparHtml($b['html'] ?? '', 8000);
        if ($h === '' && trim((string)($b['titulo'] ?? '')) === '') break;
        $out[] = ['t' => 'destaque', 'variante' => in_array($b['variante'] ?? '', ['dica', 'atencao', 'info', 'exemplo'], true) ? $b['variante'] : 'dica', 'titulo' => blogCortar($b['titulo'] ?? '', 120), 'html' => $h];
        break;

      case 'formula':
        $c = trim((string)($b['codigo'] ?? ''));
        if ($c === '') break;
        $out[] = ['t' => 'formula', 'rotulo' => blogCortar($b['rotulo'] ?? '', 120), 'codigo' => mb_substr($c, 0, 6000)];
        break;

      case 'passos':
        $itens = [];
        foreach (array_slice((array)($b['itens'] ?? []), 0, 40) as $it) {
          if (!is_array($it)) continue;
          $tit = blogCortar($it['titulo'] ?? '', 160); $h = blogLimparHtml($it['html'] ?? '', 8000); $u = blogUrl($it['url'] ?? '', true);
          if ($tit === '' && $h === '' && $u === '') continue;
          $itens[] = ['titulo' => $tit, 'html' => $h, 'url' => $u, 'alt' => blogCortar($it['alt'] ?? '', 200)];
        }
        if ($itens) $out[] = ['t' => 'passos', 'itens' => $itens];
        break;

      case 'botao':
        $u = blogUrl($b['url'] ?? '');
        $r = blogCortar($b['rotulo'] ?? '', 80);
        if ($u === '' || $r === '') break;
        $out[] = ['t' => 'botao', 'rotulo' => $r, 'url' => $u, 'estilo' => ($b['estilo'] ?? '') === 'contorno' ? 'contorno' : 'primario'];
        break;

      case 'imagem_texto':
        $u = blogUrl($b['url'] ?? '', true);
        if ($u === '') break;
        $out[] = ['t' => 'imagem_texto', 'url' => $u, 'alt' => blogCortar($b['alt'] ?? '', 200), 'titulo' => blogCortar($b['titulo'] ?? '', 160),
                  'html' => blogLimparHtml($b['html'] ?? '', 8000), 'lado' => ($b['lado'] ?? '') === 'dir' ? 'dir' : 'esq'];
        break;

      case 'lista':
        $itens = array_values(array_filter(array_map(fn($x) => blogCortar($x, 300), array_slice((array)($b['itens'] ?? []), 0, 60)), fn($x) => $x !== ''));
        if ($itens) $out[] = ['t' => 'lista', 'titulo' => blogCortar($b['titulo'] ?? '', 160), 'estilo' => in_array($b['estilo'] ?? '', ['check', 'bullets', 'numeros'], true) ? $b['estilo'] : 'check', 'itens' => $itens];
        break;

      case 'faq':
        $itens = [];
        foreach (array_slice((array)($b['itens'] ?? []), 0, 40) as $it) {
          if (!is_array($it)) continue;
          $pg = blogCortar($it['p'] ?? '', 250); $rs = blogLimparHtml($it['r'] ?? '', 6000);
          if ($pg !== '' && $rs !== '') $itens[] = ['p' => $pg, 'r' => $rs];
        }
        if ($itens) $out[] = ['t' => 'faq', 'titulo' => blogCortar($b['titulo'] ?? '', 160), 'itens' => $itens];
        break;

      case 'cta':
        $out[] = ['t' => 'cta', 'titulo' => blogCortar($b['titulo'] ?? '', 160), 'texto' => blogCortar($b['texto'] ?? '', 400), 'rotulo' => blogCortar($b['rotulo'] ?? '', 60),
                  'url' => blogUrl($b['url'] ?? '', true), 'preco' => ($b['preco'] ?? true) !== false];
        break;

      case 'divisor':
        $out[] = ['t' => 'divisor'];
        break;

      case 'painel':
        $out[] = ['t' => 'painel', 'legenda' => blogCortar($b['legenda'] ?? '', 300)];
        break;
    }
  }
  return $out;
}

function blogPrecisaPainel(array $blocos): bool {
  foreach ($blocos as $b) if (($b['t'] ?? '') === 'painel') return true;
  return false;
}

/* ====================================================================== blocos: renderização */

/** Converte o endereço colado no editor no endereço "de incorporar" do serviço (YouTube, Vimeo, Looker Studio, Google Planilhas...). */
function blogEmbedInfo(string $u): array {
  $video = false;
  $p = parse_url($u) ?: [];
  $host = strtolower($p['host'] ?? '');
  $host = preg_replace('/^www\./', '', $host);
  $path = $p['path'] ?? '';
  parse_str($p['query'] ?? '', $q);

  if (in_array($host, ['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'], true) || $host === 'youtu.be') {
    $id = '';
    if ($host === 'youtu.be') $id = trim($path, '/');
    elseif (!empty($q['v'])) $id = (string)$q['v'];
    elseif (preg_match('~^/(embed|shorts|live)/([\w-]{6,})~', $path, $m)) $id = $m[2];
    if (preg_match('/^[\w-]{6,20}$/', $id)) return ['https://www.youtube-nocookie.com/embed/' . $id, true];
  }
  if ($host === 'vimeo.com' && preg_match('~^/(\d+)~', $path, $m)) return ['https://player.vimeo.com/video/' . $m[1], true];
  if ($host === 'lookerstudio.google.com' || $host === 'datastudio.google.com') {
    if (preg_match('~^/reporting/~', $path)) return ['https://' . $host . '/embed' . $path, false];
  }
  if ($host === 'docs.google.com' && preg_match('~^/(spreadsheets|presentation|document)/d/([\w-]+)/(edit|view)?~', $path, $m) && strpos($path, '/pub') === false) {
    $tipo = $m[1];
    return ['https://docs.google.com/' . $tipo . '/d/' . $m[2] . ($tipo === 'presentation' ? '/embed' : '/preview'), false];
  }
  return [$u, $video];
}

function blogRenderTexto(string $html): string { return $html; } // já sanitizado ao salvar; não passa por nenhum outro caminho

function blogRenderBlocos(array $blocos, array $ctx = []): string {
  $o = '';
  foreach ($blocos as $b) {
    $t = $b['t'] ?? '';
    switch ($t) {
      case 'texto':
        $o .= '<div class="b-texto">' . blogLimparHtml($b['html'] ?? '') . '</div>';
        break;

      case 'imagem':
        $dim = (!empty($b['w']) && !empty($b['h'])) ? ' width="' . (int)$b['w'] . '" height="' . (int)$b['h'] . '"' : '';
        $o .= '<figure class="b-imagem b-larg-' . blogEsc($b['largura'] ?? 'normal') . '"><img src="' . blogEsc($b['url']) . '" alt="' . blogEsc($b['alt'] ?? '') . '" loading="lazy" decoding="async"' . $dim . ' data-zoom>'
          . (!empty($b['legenda']) ? '<figcaption>' . blogEsc($b['legenda']) . '</figcaption>' : '') . '</figure>';
        break;

      case 'galeria':
        $o .= '<div class="b-galeria cols-' . (int)($b['colunas'] ?? 3) . '">';
        foreach ($b['itens'] as $it) {
          $o .= '<figure><img src="' . blogEsc($it['url']) . '" alt="' . blogEsc($it['alt'] ?? '') . '" loading="lazy" decoding="async" data-zoom>'
            . (!empty($it['legenda']) ? '<figcaption>' . blogEsc($it['legenda']) . '</figcaption>' : '') . '</figure>';
        }
        $o .= '</div>';
        break;

      case 'arquivo':
        $ext = strtoupper((string)($b['ext'] ?? ''));
        $cls = 'ext-' . preg_replace('/[^a-z0-9]/', '', strtolower($ext));
        $meta = array_filter([$b['descricao'] ?? '', $ext, !empty($b['tamanho']) ? blogBytes((int)$b['tamanho']) : '']);
        $o .= '<a class="b-arquivo" href="' . blogEsc($b['url']) . '" download><span class="b-arq-ico ' . blogEsc($cls) . '">' . blogEsc(mb_substr($ext !== '' ? $ext : 'ARQ', 0, 4)) . '</span>'
          . '<span class="b-arq-info"><strong>' . blogEsc($b['nome']) . '</strong><small>' . blogEsc(implode(' · ', $meta)) . '</small></span><span class="b-arq-btn">Baixar</span></a>';
        break;

      case 'tabela':
        $o .= '<figure class="b-tabela"><div class="b-tabela-rolagem"><table>';
        foreach ($b['linhas'] as $i => $l) {
          $cab = !empty($b['cab']) && $i === 0;
          $o .= '<tr>';
          foreach ($l as $c) $o .= ($cab ? '<th>' : '<td>') . nl2br(blogEsc($c)) . ($cab ? '</th>' : '</td>');
          $o .= '</tr>';
        }
        $o .= '</table></div>' . (!empty($b['legenda']) ? '<figcaption>' . blogEsc($b['legenda']) . '</figcaption>' : '') . '</figure>';
        break;

      case 'incorporar':
        [$src, $video] = blogEmbedInfo($b['url']);
        $o .= '<figure class="b-embed' . ($video ? ' b-embed-video' : '') . '"><div class="b-embed-quadro" style="--h:' . (int)$b['altura'] . 'px"><iframe src="' . blogEsc($src) . '" title="' . blogEsc($b['titulo'] ?: 'Conteúdo incorporado') . '" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation"></iframe></div>'
          . (!empty($b['legenda']) ? '<figcaption>' . blogEsc($b['legenda']) . '</figcaption>' : '')
          . '<p class="b-embed-abrir"><a href="' . blogEsc($b['url']) . '" target="_blank" rel="noopener noreferrer">Abrir em outra aba ↗</a></p></figure>';
        break;

      case 'destaque':
        $rot = ['dica' => 'Dica', 'atencao' => 'Atenção', 'info' => 'Informação', 'exemplo' => 'Exemplo'][$b['variante'] ?? 'dica'] ?? 'Dica';
        $o .= '<aside class="b-destaque v-' . blogEsc($b['variante'] ?? 'dica') . '"><strong class="b-destaque-t">' . blogEsc($b['titulo'] ?: $rot) . '</strong><div>' . blogLimparHtml($b['html'] ?? '') . '</div></aside>';
        break;

      case 'formula':
        $o .= '<div class="b-formula"><div class="b-formula-topo"><span>' . blogEsc($b['rotulo'] ?: 'Fórmula') . '</span><button type="button" data-copiar>Copiar</button></div><pre><code>' . blogEsc($b['codigo']) . '</code></pre></div>';
        break;

      case 'passos':
        $o .= '<ol class="b-passos">';
        foreach ($b['itens'] as $it) {
          $o .= '<li>' . ($it['titulo'] !== '' ? '<h3>' . blogEsc($it['titulo']) . '</h3>' : '') . ($it['html'] !== '' ? '<div class="b-passo-texto">' . blogLimparHtml($it['html']) . '</div>' : '')
            . ($it['url'] !== '' ? '<figure class="b-passo-img"><img src="' . blogEsc($it['url']) . '" alt="' . blogEsc($it['alt'] ?? '') . '" loading="lazy" decoding="async" data-zoom></figure>' : '') . '</li>';
        }
        $o .= '</ol>';
        break;

      case 'botao':
        $ext = blogUrlExterna($b['url']);
        $o .= '<p class="b-botao"><a class="btn ' . (($b['estilo'] ?? '') === 'contorno' ? 'btn-outline' : 'btn-primary') . '" href="' . blogEsc($b['url']) . '"' . ($ext ? ' target="_blank" rel="noopener noreferrer"' : '') . '>' . blogEsc($b['rotulo']) . '</a></p>';
        break;

      case 'imagem_texto':
        $o .= '<section class="b-imgtexto lado-' . blogEsc($b['lado'] ?? 'esq') . '"><figure><img src="' . blogEsc($b['url']) . '" alt="' . blogEsc($b['alt'] ?? '') . '" loading="lazy" decoding="async" data-zoom></figure>'
          . '<div class="b-imgtexto-txt">' . ($b['titulo'] !== '' ? '<h3>' . blogEsc($b['titulo']) . '</h3>' : '') . blogLimparHtml($b['html'] ?? '') . '</div></section>';
        break;

      case 'lista':
        $tag = ($b['estilo'] ?? 'check') === 'numeros' ? 'ol' : 'ul';
        $o .= '<div class="b-lista v-' . blogEsc($b['estilo'] ?? 'check') . '">' . (($b['titulo'] ?? '') !== '' ? '<h3>' . blogEsc($b['titulo']) . '</h3>' : '') . "<$tag>";
        foreach ($b['itens'] as $it) $o .= '<li>' . blogEsc($it) . '</li>';
        $o .= "</$tag></div>";
        break;

      case 'faq':
        $o .= '<div class="b-faq">' . (($b['titulo'] ?? '') !== '' ? '<h3>' . blogEsc($b['titulo']) . '</h3>' : '');
        foreach ($b['itens'] as $it) $o .= '<details><summary>' . blogEsc($it['p']) . '</summary><div>' . blogLimparHtml($it['r']) . '</div></details>';
        $o .= '</div>';
        break;

      case 'cta':
        $url = ($b['url'] ?? '') !== '' ? $b['url'] : ($ctx['cta']['url'] ?? '');
        $rot = ($b['rotulo'] ?? '') !== '' ? $b['rotulo'] : ($ctx['cta']['rotulo'] ?? 'Quero este material');
        $preco = !empty($b['preco']) ? ($ctx['cta']['preco'] ?? '') : '';
        $o .= '<section class="b-cta"><div class="b-cta-txt">' . (($b['titulo'] ?? '') !== '' ? '<h3>' . blogEsc($b['titulo']) . '</h3>' : '') . (($b['texto'] ?? '') !== '' ? '<p>' . blogEsc($b['texto']) . '</p>' : '') . '</div>'
          . '<div class="b-cta-acao">' . ($preco !== '' ? '<span class="b-cta-preco">' . blogEsc($preco) . '</span>' : '')
          . ($url !== '' ? '<a class="btn btn-primary" href="' . blogEsc($url) . '"' . (blogUrlExterna($url) ? ' target="_blank" rel="noopener noreferrer"' : '') . '>' . blogEsc($rot) . '</a>' : '') . '</div></section>';
        break;

      case 'divisor':
        $o .= '<hr class="b-divisor">';
        break;

      case 'painel':
        $o .= '<figure class="b-painel"><div class="dash" id="dash" aria-label="Painel financeiro interativo de demonstração"><noscript><p class="dash-noscript">Este painel interativo precisa de JavaScript.</p></noscript></div>'
          . '<figcaption>' . blogEsc(($b['legenda'] ?? '') ?: 'Painel ilustrativo, com dados fictícios de uma empresa modelo.') . '</figcaption></figure>';
        break;
    }
  }
  return $o;
}

/* ====================================================================== post: resumo, leitura, JSON */

function blogTempoLeitura(array $blocos): int {
  $palavras = 0;
  foreach ($blocos as $b) {
    foreach (['html', 'titulo', 'legenda', 'descricao'] as $k) if (!empty($b[$k]) && is_string($b[$k])) $palavras += str_word_count(blogTextoPlano($b[$k]), 0, 'áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ');
    if (($b['t'] ?? '') === 'passos') foreach ($b['itens'] as $it) $palavras += str_word_count(blogTextoPlano(($it['titulo'] ?? '') . ' ' . ($it['html'] ?? '')), 0, 'áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ');
    if (($b['t'] ?? '') === 'tabela') $palavras += 20;
    if (($b['t'] ?? '') === 'lista') foreach ($b['itens'] as $it) $palavras += str_word_count(blogTextoPlano($it), 0, 'áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ');
    if (($b['t'] ?? '') === 'faq') foreach ($b['itens'] as $it) $palavras += str_word_count(blogTextoPlano($it['p'] . ' ' . $it['r']), 0, 'áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ');
  }
  return max(1, (int)ceil($palavras / 200));
}

function blogResumoAuto(array $blocos, int $max = 200): string {
  foreach ($blocos as $b) {
    if (($b['t'] ?? '') !== 'texto') continue;
    $t = blogTextoPlano($b['html'] ?? '');
    if ($t === '') continue;
    return mb_strlen($t) > $max ? rtrim(mb_substr($t, 0, $max - 1)) . '…' : $t;
  }
  return '';
}

function blogBlocosDe(array $row): array {
  $b = json_decode((string)($row['blocos_json'] ?? '[]'), true);
  return is_array($b) ? $b : [];
}

/** Endereço público da página: conteúdos em /conteudos/..., infoprodutos em /infoprodutos/... */
function blogUrlDoPost(array $r): string {
  return (($r['tipo'] ?? 'blog') === 'infoproduto' ? '/infoprodutos/' : '/conteudos/') . $r['slug'];
}

/** Botão principal de uma página de venda: rótulo, endereço e preço. Gratuito baixa/abre; pago leva ao checkout. */
function blogCtaProduto(array $r): array {
  $gratis = !empty($r['gratuito']);
  $url = (string)($r['link_compra'] ?? '');
  $rot = trim((string)($r['cta_rotulo'] ?? '')) ?: ($gratis ? 'Baixar grátis' : 'Comprar agora');
  return ['url' => $url, 'rotulo' => $rot, 'preco' => $gratis ? 'Grátis' : trim((string)($r['preco_label'] ?? '')), 'gratuito' => $gratis];
}

/** Forma "de lista" (cartões): sem os blocos. */
function blogResumoJson(array $r): array {
  $blocos = blogBlocosDe($r);
  $resumo = trim((string)($r['resumo'] ?? '')) ?: blogResumoAuto($blocos);
  return [
    'id' => $r['id'], 'slug' => $r['slug'], 'titulo' => $r['titulo'], 'resumo' => $resumo,
    'capa' => $r['capa'] ?: null, 'capaAlt' => $r['capa_alt'] ?: '', 'categoria' => $r['categoria'] ?: null,
    'status' => $r['status'], 'publicadoEm' => $r['publicado_em'], 'atualizadoEm' => $r['atualizado_em'],
    'tempoLeitura' => blogTempoLeitura($blocos), 'tipo' => $r['tipo'] ?? 'blog', 'url' => blogUrlDoPost($r),
    'precoLabel' => (string)($r['preco_label'] ?? ''), 'gratuito' => !empty($r['gratuito']),
  ];
}

function blogPostJson(array $r): array {
  $base = blogResumoJson($r);
  $base['resumoOriginal'] = (string)($r['resumo'] ?? '');
  $base['tags'] = (string)($r['tags'] ?? '');
  $base['seoDescricao'] = (string)($r['seo_descricao'] ?? '');
  $base['autor'] = (string)($r['autor'] ?? '');
  $base['linkCompra'] = (string)($r['link_compra'] ?? '');
  $base['ctaRotulo'] = (string)($r['cta_rotulo'] ?? '');
  $base['criadoEm'] = $r['criado_em'];
  $base['blocos'] = blogBlocosDe($r);
  return $base;
}

/* ====================================================================== consultas públicas */

function blogPublicados(PDO $db, int $limite = 12, int $pagina = 1, ?string $categoria = null, string $tipo = 'blog'): array {
  $agora = nowIso();
  $where = "tipo = ? AND status = 'publicado' AND publicado_em IS NOT NULL AND publicado_em <= ?";
  $params = [$tipo === 'infoproduto' ? 'infoproduto' : 'blog', $agora];
  if ($categoria) { $where .= ' AND categoria = ?'; $params[] = $categoria; }
  $stmt = $db->prepare("SELECT COUNT(*) FROM posts WHERE $where");
  $stmt->execute($params);
  $total = (int)$stmt->fetchColumn();
  $limite = max(1, min(50, $limite));
  $paginas = max(1, (int)ceil($total / $limite));
  $pagina = max(1, min($paginas, $pagina));
  $stmt = $db->prepare("SELECT * FROM posts WHERE $where ORDER BY publicado_em DESC, criado_em DESC LIMIT " . $limite . ' OFFSET ' . (($pagina - 1) * $limite));
  $stmt->execute($params);
  return ['posts' => array_map('blogResumoJson', $stmt->fetchAll()), 'total' => $total, 'pagina' => $pagina, 'paginas' => $paginas];
}

function blogPostPorSlug(PDO $db, string $slug, bool $incluirRascunho = false): ?array {
  $stmt = $db->prepare('SELECT * FROM posts WHERE slug = ? LIMIT 1');
  $stmt->execute([$slug]);
  $r = $stmt->fetch();
  if (!$r) return null;
  if (!$incluirRascunho && ($r['status'] !== 'publicado' || !$r['publicado_em'] || $r['publicado_em'] > nowIso())) return null;
  return $r;
}

function blogCategorias(PDO $db): array {
  $stmt = $db->prepare("SELECT categoria, COUNT(*) n FROM posts WHERE tipo = 'blog' AND status = 'publicado' AND publicado_em <= ? AND categoria IS NOT NULL AND categoria <> '' GROUP BY categoria ORDER BY n DESC, categoria ASC");
  $stmt->execute([nowIso()]);
  return $stmt->fetchAll();
}

/* ====================================================================== salvar (admin) */

function blogSlugUnico(PDO $db, string $base, ?string $idAtual): string {
  $base = blogSlug($base) ?: 'post';
  if (in_array($base, BLOG_RESERVADOS, true)) $base .= '-post';
  $base = mb_substr($base, 0, 120);
  $slug = $base; $i = 2;
  while (true) {
    $stmt = $db->prepare('SELECT id FROM posts WHERE slug = ? LIMIT 1');
    $stmt->execute([$slug]);
    $achou = $stmt->fetchColumn();
    if (!$achou || $achou === $idAtual) return $slug;
    $slug = $base . '-' . $i++;
  }
}

/** Cria ou atualiza um post. Devolve a linha salva. Lança InvalidArgumentException se faltar o essencial. */
function blogSalvar(PDO $db, array $d): array {
  $titulo = blogCortar($d['titulo'] ?? '', 255);
  if ($titulo === '') throw new InvalidArgumentException('Informe o título do post.');
  $id = trim((string)($d['id'] ?? ''));
  $existente = null;
  if ($id !== '') {
    $stmt = $db->prepare('SELECT * FROM posts WHERE id = ?');
    $stmt->execute([$id]);
    $existente = $stmt->fetch() ?: null;
  }
  $status = ($d['status'] ?? 'rascunho') === 'publicado' ? 'publicado' : 'rascunho';
  $blocos = blogNormalizarBlocos($d['blocos'] ?? []);
  if ($status === 'publicado' && !$blocos) throw new InvalidArgumentException('Escreva ao menos um bloco antes de publicar.');

  $agora = nowIso();
  $pub = trim((string)($d['publicadoEm'] ?? ''));
  if ($pub !== '' && !strtotime($pub)) throw new InvalidArgumentException('Data de publicação inválida.');
  $pubIso = $pub !== '' ? gmdate('Y-m-d\TH:i:s.000\Z', strtotime($pub)) : null;
  if ($status === 'publicado' && !$pubIso) $pubIso = $existente['publicado_em'] ?? $agora;
  if ($status === 'rascunho' && !$pubIso) $pubIso = $existente['publicado_em'] ?? null;

  $tipo = ($d['tipo'] ?? 'blog') === 'infoproduto' ? 'infoproduto' : 'blog';
  $slugBase = trim((string)($d['slug'] ?? '')) !== '' ? (string)$d['slug'] : $titulo;
  $slug = blogSlugUnico($db, $slugBase, $existente['id'] ?? null);
  $capa = blogUrl($d['capa'] ?? '', true);
  $linha = [
    'tipo' => $tipo, 'slug' => $slug, 'titulo' => $titulo, 'resumo' => blogCortar($d['resumo'] ?? '', 600) ?: null,
    'capa' => $capa ?: null, 'capa_alt' => blogCortar($d['capaAlt'] ?? '', 255) ?: null,
    'categoria' => blogCortar($d['categoria'] ?? '', 80) ?: null,
    'tags' => blogCortar(implode(', ', array_filter(array_map('trim', explode(',', (string)($d['tags'] ?? ''))))), 255) ?: null,
    'status' => $status, 'publicado_em' => $pubIso,
    'seo_descricao' => blogCortar($d['seoDescricao'] ?? '', 300) ?: null, 'autor' => blogCortar($d['autor'] ?? '', 120) ?: null,
    'preco_label' => $tipo === 'infoproduto' ? (blogCortar($d['precoLabel'] ?? '', 60) ?: null) : null,
    'gratuito' => $tipo === 'infoproduto' && !empty($d['gratuito']) ? 1 : 0,
    'link_compra' => $tipo === 'infoproduto' ? (blogUrl($d['linkCompra'] ?? '', true) ?: null) : null,
    'cta_rotulo' => $tipo === 'infoproduto' ? (blogCortar($d['ctaRotulo'] ?? '', 60) ?: null) : null,
    'blocos_json' => json_encode($blocos, JSON_UNESCAPED_UNICODE),
  ];
  if ($existente) {
    $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($linha)));
    $db->prepare("UPDATE posts SET $sets, atualizado_em = ? WHERE id = ?")->execute([...array_values($linha), $agora, $existente['id']]);
    $id = $existente['id'];
  } else {
    $id = 'p' . bin2hex(random_bytes(6));
    $cols = implode(', ', array_keys($linha));
    $db->prepare("INSERT INTO posts (id, $cols, criado_em, atualizado_em) VALUES (?," . implode(',', array_fill(0, count($linha), '?')) . ',?,?)')
       ->execute([$id, ...array_values($linha), $agora, $agora]);
  }
  $stmt = $db->prepare('SELECT * FROM posts WHERE id = ?');
  $stmt->execute([$id]);
  return $stmt->fetch();
}

/* ====================================================================== upload (admin) */

function blogPastaUploads(): string {
  return dirname(__DIR__) . '/uploads';
}

/** Recebe um item de $_FILES e devolve ['url','nome','tamanho','ext','tipo','w','h']. Lança RuntimeException com mensagem amigável. */
function blogSalvarUpload(array $f): array {
  if (($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    $msgs = [UPLOAD_ERR_INI_SIZE => 'O arquivo é maior do que o servidor aceita.', UPLOAD_ERR_FORM_SIZE => 'O arquivo é grande demais.', UPLOAD_ERR_PARTIAL => 'O envio foi interrompido. Tente de novo.', UPLOAD_ERR_NO_FILE => 'Nenhum arquivo enviado.'];
    throw new RuntimeException($msgs[$f['error'] ?? 0] ?? 'Não foi possível receber o arquivo.');
  }
  $tam = (int)$f['size'];
  if ($tam <= 0) throw new RuntimeException('O arquivo está vazio.');
  if ($tam > BLOG_MAX_UPLOAD) throw new RuntimeException('O arquivo passa de ' . (int)(BLOG_MAX_UPLOAD / 1048576) . ' MB.');

  $orig = (string)($f['name'] ?? 'arquivo');
  $ext = strtolower(pathinfo($orig, PATHINFO_EXTENSION));
  $ehImagem = in_array($ext, BLOG_EXT_IMAGEM, true);
  if (!$ehImagem && !in_array($ext, BLOG_EXT_ARQUIVO, true)) {
    throw new RuntimeException('Tipo de arquivo não permitido (.' . ($ext ?: '?') . '). Aceitos: fotos (jpg, png, gif, webp), planilhas (xlsx, xls, csv), pdf, docx, pptx, zip, pbix.');
  }
  $tmp = (string)$f['tmp_name'];
  if (!is_uploaded_file($tmp) && !(defined('BLOG_TESTE') && BLOG_TESTE && is_file($tmp))) throw new RuntimeException('Envio inválido.');

  $w = 0; $h = 0;
  if ($ehImagem) {
    $info = @getimagesize($tmp);
    if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_GIF, IMAGETYPE_WEBP], true)) throw new RuntimeException('Esse arquivo não é uma imagem válida.');
    [$w, $h] = [(int)$info[0], (int)$info[1]];
  }

  $pasta = blogPastaUploads() . '/midia/' . gmdate('Y') . '/' . gmdate('m');
  if (!is_dir($pasta) && !@mkdir($pasta, 0755, true) && !is_dir($pasta)) throw new RuntimeException('Não foi possível criar a pasta de arquivos no servidor.');
  foreach ([blogPastaUploads(), blogPastaUploads() . '/midia', dirname($pasta), $pasta] as $d) { // impede listar a pasta
    if (!file_exists($d . '/index.html')) @file_put_contents($d . '/index.html', '');
  }
  $nomeBase = blogSlug(pathinfo($orig, PATHINFO_FILENAME)) ?: 'arquivo';
  $nomeFinal = mb_substr($nomeBase, 0, 60) . '-' . bin2hex(random_bytes(4)) . '.' . $ext;
  $destino = $pasta . '/' . $nomeFinal;

  $ok = false;
  if ($ehImagem && function_exists('imagecreatetruecolor') && $ext !== 'gif') {
    $ok = blogReduzirImagem($tmp, $destino, $ext, $w, $h);
    if ($ok) { $info2 = @getimagesize($destino); if ($info2) { $w = (int)$info2[0]; $h = (int)$info2[1]; } $tam = (int)filesize($destino); }
  }
  if (!$ok) {
    $ok = is_uploaded_file($tmp) ? move_uploaded_file($tmp, $destino) : copy($tmp, $destino);
    if (!$ok) throw new RuntimeException('Não foi possível salvar o arquivo no servidor.');
  }
  @chmod($destino, 0644);

  return ['url' => '/uploads/midia/' . gmdate('Y') . '/' . gmdate('m') . '/' . $nomeFinal, 'nome' => mb_substr($orig, 0, 160), 'tamanho' => $tam, 'ext' => $ext,
          'tipo' => $ehImagem ? 'imagem' : 'arquivo', 'w' => $w, 'h' => $h];
}

/** No PHP 8 a imagem é um objeto liberado sozinho (e imagedestroy() já está obsoleta); no 7 ainda é preciso liberar. */
function blogLiberarImagem($im): void {
  if (PHP_VERSION_ID < 80000 && is_resource($im)) imagedestroy($im);
}

/** Regrava a imagem (limite de 1920px, respeita a orientação do celular). Também descarta qualquer coisa que não seja pixel. */
function blogReduzirImagem(string $origem, string $destino, string $ext, int $w, int $h): bool {
  switch ($ext) { // (switch em vez de match: funciona também em PHP 7.4)
    case 'jpg': case 'jpeg': $im = @imagecreatefromjpeg($origem); break;
    case 'png': $im = @imagecreatefrompng($origem); break;
    case 'webp': $im = function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($origem) : false; break;
    default: $im = false;
  }
  if (!$im) return false;
  if (in_array($ext, ['jpg', 'jpeg'], true) && function_exists('exif_read_data')) {
    $ex = @exif_read_data($origem);
    $o = (int)($ex['Orientation'] ?? 1);
    $ang = [3 => 180, 6 => -90, 8 => 90][$o] ?? 0;
    if ($ang) { $rot = imagerotate($im, $ang, 0); if ($rot) { blogLiberarImagem($im); $im = $rot; [$w, $h] = [imagesx($im), imagesy($im)]; } }
  }
  $max = 1920;
  if ($w > $max || $h > $max) {
    $k = $max / max($w, $h);
    $nw = max(1, (int)round($w * $k)); $nh = max(1, (int)round($h * $k));
    $novo = imagecreatetruecolor($nw, $nh);
    if ($ext === 'png' || $ext === 'webp') { imagealphablending($novo, false); imagesavealpha($novo, true); imagefill($novo, 0, 0, imagecolorallocatealpha($novo, 0, 0, 0, 127)); }
    imagecopyresampled($novo, $im, 0, 0, 0, 0, $nw, $nh, $w, $h);
    blogLiberarImagem($im); $im = $novo;
  } elseif ($ext === 'png' || $ext === 'webp') { imagealphablending($im, false); imagesavealpha($im, true); }
  switch ($ext) {
    case 'jpg': case 'jpeg': $ok = imagejpeg($im, $destino, 84); break;
    case 'png': $ok = imagepng($im, $destino, 7); break;
    case 'webp': $ok = function_exists('imagewebp') ? imagewebp($im, $destino, 82) : false; break;
    default: $ok = false;
  }
  blogLiberarImagem($im);
  return (bool)$ok;
}
