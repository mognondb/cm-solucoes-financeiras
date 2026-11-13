<?php
/**
 * Capa provisória: quando uma publicação não tem imagem de capa, o site desenha uma
 * (1200x630, o tamanho da prévia de link do WhatsApp, LinkedIn, Facebook...) com a marca e o título.
 * Usa GD + FreeType e as fontes em assets/fonts. Se algo faltar no servidor, quem chama usa a
 * imagem fixa assets/img/capa-padrao.png.
 */
declare(strict_types=1);

const CM_CAPA_VERSAO = 1; // mudou o desenho? aumente: as prévias de link antigas são renovadas

function cmCapaAutoUrl(array $r): string {
  $v = substr(md5(CM_CAPA_VERSAO . '|' . ($r['titulo'] ?? '') . '|' . ($r['categoria'] ?? '') . '|' . ($r['tipo'] ?? '') . '|' . ($r['preco_label'] ?? '') . '|' . ($r['gratuito'] ?? '')), 0, 8);
  return '/conteudos/capa/' . $r['slug'] . '.png?v=' . $v;
}

/** Só deixa passar o que as fontes embutidas sabem desenhar. */
function cmCapaTexto(string $t): string {
  $t = preg_replace('/[^\x{20}-\x{7E}\x{A0}-\x{FF}\x{2013}\x{2014}\x{2018}\x{2019}\x{201C}\x{201D}\x{2026}\x{2022}\x{20AC}]/u', '', $t) ?? '';
  return trim(preg_replace('/\s+/u', ' ', $t) ?? '');
}

/** Largura do texto em pixels, para a fonte pedida em pixels (o GD pede pontos: 96 dpi). */
function cmCapaLargura(string $fonte, float $px, string $t): float {
  $b = imagettfbbox($px * 0.75, 0, $fonte, $t);
  return $b ? (float)($b[2] - $b[0]) : 0.0;
}

/** Quebra o título em linhas que cabem em $max pixels. */
function cmCapaQuebrar(string $fonte, float $px, string $t, float $max): array {
  $linhas = [];
  $atual = '';
  foreach (explode(' ', $t) as $p) {
    $teste = $atual === '' ? $p : $atual . ' ' . $p;
    if ($atual !== '' && cmCapaLargura($fonte, $px, $teste) > $max) { $linhas[] = $atual; $atual = $p; }
    else $atual = $teste;
  }
  if ($atual !== '') $linhas[] = $atual;
  return $linhas;
}

/** Devolve o PNG (texto binário) ou null se o servidor não consegue desenhar. */
function cmCapaDesenhar(string $titulo, string $rotulo, string $selo = ''): ?string {
  if (!function_exists('imagettftext') || !function_exists('imagecreatetruecolor') || !function_exists('imagepng')) return null;
  $raiz = dirname(__DIR__);
  $fTit = $raiz . '/assets/fonts/Fraunces-Capa.ttf';
  $fTxt = $raiz . '/assets/fonts/Inter-Medium-Capa.otf';
  $logo = $raiz . '/assets/img/logo-cm-branco.png';
  if (!is_file($fTit) || !is_file($fTxt)) return null;

  $titulo = cmCapaTexto($titulo);
  if ($titulo === '') $titulo = 'CM Soluções Financeiras';
  $rotulo = mb_strtoupper(cmCapaTexto($rotulo));
  $selo = cmCapaTexto($selo);

  $S = 2; // desenha em dobro e reduz no fim: bordas e curvas ficam suaves
  $W = 1200 * $S; $H = 630 * $S;
  $im = imagecreatetruecolor($W, $H);
  if (!$im) return null;
  imagealphablending($im, true);

  // fundo: degradê verde-oliva
  [$r1, $g1, $b1, $r2, $g2, $b2] = [0x4a, 0x5a, 0x42, 0x34, 0x40, 0x2e];
  for ($y = 0; $y < $H; $y++) {
    $t = $y / $H;
    imageline($im, 0, $y, $W, $y, imagecolorallocate($im, (int)round($r1 * (1 - $t) + $r2 * $t), (int)round($g1 * (1 - $t) + $g2 * $t), (int)round($b1 * (1 - $t) + $b2 * $t)));
  }

  // anéis decorativos (iguais aos da página inicial)
  $anel = function (int $cx, int $cy, int $r, int $cor) use ($im, $S): void {
    for ($k = 0; $k < 2 * $S; $k++) imageellipse($im, $cx * $S, $cy * $S, 2 * ($r * $S + $k), 2 * ($r * $S + $k), $cor);
  };
  $anel(1030, 70, 340, imagecolorallocatealpha($im, 205, 182, 140, 67));
  $anel(1030, 70, 250, imagecolorallocatealpha($im, 255, 255, 255, 107));
  $anel(90, 660, 230, imagecolorallocatealpha($im, 199, 205, 186, 98));

  // marca
  if (is_file($logo) && ($lg = @imagecreatefrompng($logo))) {
    $lw = imagesx($lg); $lh = imagesy($lg);
    $dw = 120 * $S; $dh = (int)round($lh * $dw / $lw);
    imagecopyresampled($im, $lg, 80 * $S, 66 * $S, 0, 0, $dw, $dh, $lw, $lh);
  }

  $branco = imagecolorallocate($im, 255, 255, 255);
  $ouro = imagecolorallocate($im, 205, 182, 140);
  $suave = imagecolorallocate($im, 199, 205, 186);

  // título: o maior tamanho (72 a 44 px) em que cabe em até 4 linhas
  $larguraMax = 1040; $alturaMax = 250;
  $escolhido = null;
  for ($px = 72; $px >= 44; $px -= 2) {
    $linhas = cmCapaQuebrar($fTit, $px, $titulo, $larguraMax);
    $lh = $px * 1.18;
    $cabe = count($linhas) * $lh <= $alturaMax;
    foreach ($linhas as $l) if (cmCapaLargura($fTit, $px, $l) > $larguraMax) $cabe = false;
    if ($cabe) { $escolhido = [$px, $linhas]; break; }
  }
  if (!$escolhido) { // título enorme: 44 px, corta com reticências
    $px = 44; $lh = $px * 1.18;
    $linhas = cmCapaQuebrar($fTit, $px, $titulo, $larguraMax);
    $max = max(1, (int)floor($alturaMax / $lh));
    if (count($linhas) > $max) {
      $linhas = array_slice($linhas, 0, $max);
      $ult = rtrim($linhas[$max - 1], " .,;:") . '…';
      while (cmCapaLargura($fTit, $px, $ult) > $larguraMax && mb_strlen($ult) > 2) $ult = rtrim(mb_substr($ult, 0, -2), " .,;:") . '…';
      $linhas[$max - 1] = $ult;
    }
    $escolhido = [$px, $linhas];
  }
  [$px, $linhas] = $escolhido;
  $lh = $px * 1.18;

  // bloco (etiqueta + título) centralizado entre o logo e o rodapé
  $etiquetaAltura = $rotulo !== '' ? 46 : 0;
  $bloco = $etiquetaAltura + count($linhas) * $lh;
  $topo = 190 + (330 - $bloco) / 2;

  if ($rotulo !== '') { // etiqueta em letras espaçadas
    $x = 80.0;
    foreach (mb_str_split(mb_substr($rotulo, 0, 40)) as $ch) {
      imagettftext($im, 21 * 0.75 * $S, 0, (int)round($x * $S), (int)round(($topo + 20) * $S), $ouro, $fTxt, $ch);
      $x += ($ch === ' ' ? 9 : cmCapaLargura($fTxt, 21, $ch)) + 3.4;
    }
  }
  foreach ($linhas as $i => $l) {
    imagettftext($im, $px * 0.75 * $S, 0, 80 * $S, (int)round(($topo + $etiquetaAltura + $px * 0.92 + $i * $lh) * $S), $branco, $fTit, $l);
  }

  // rodapé: traço, endereço do site e (se for infoproduto) o preço
  imagesetthickness($im, 3 * $S);
  imageline($im, 80 * $S, 541 * $S, 160 * $S, 541 * $S, $ouro);
  imagettftext($im, 22 * 0.75 * $S, 0, 80 * $S, 590 * $S, $suave, $fTxt, 'cmfinanceiro.com');
  if ($selo !== '') {
    $selo = mb_substr($selo, 0, 24);
    $sw = cmCapaLargura($fTit, 40, $selo);
    imagettftext($im, 40 * 0.75 * $S, 0, (int)round((1120 - $sw) * $S), 592 * $S, $branco, $fTit, $selo);
  }

  $fim = imagecreatetruecolor(1200, 630);
  imagecopyresampled($fim, $im, 0, 0, 0, 0, 1200, 630, $W, $H);
  ob_start();
  imagepng($fim, null, 6);
  $png = (string)ob_get_clean();
  if (PHP_VERSION_ID < 80000) { imagedestroy($im); imagedestroy($fim); }
  return $png !== '' ? $png : null;
}
