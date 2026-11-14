<?php
/** Roteador mínimo da API do consultório: método + padrão de caminho ("pacientes/{id}") → função. */
declare(strict_types=1);

final class PsiRoteador {
  /** níveis de acesso:
   *  livre         → sem bloqueio nem login (estado da plataforma, entrada do painel)
   *  admin         → usuário/senha do painel administrativo (HTTP Basic)
   *  publica       → passa pelo acesso restrito, sem login (cadastro, entrar, recuperar senha)
   *  login         → logado; pedidos que alteram dados exigem CSRF e conta ativa (não expirada)
   *  login_sempre  → logado; funciona mesmo com o teste expirado (sair, exportar, trocar senha) */
  private array $rotas = [];

  public function add(string $metodo, string $padrao, callable $fn, string $acesso = 'login'): void {
    $partes = array_map(function ($seg) {
      return preg_match('/^\{(\w+)\}$/', $seg, $m) ? '(?P<' . $m[1] . '>[^/]+)' : preg_quote($seg, '#');
    }, explode('/', $padrao));
    $this->rotas[] = ['metodo' => $metodo, 're' => '#^' . implode('/', $partes) . '$#', 'fn' => $fn, 'acesso' => $acesso];
  }

  public function despachar(string $metodo, string $caminho) {
    $caminho = trim($caminho, '/');
    $outroMetodo = false;
    foreach ($this->rotas as $r) {
      if (!preg_match($r['re'], $caminho, $m)) continue;
      if ($r['metodo'] !== $metodo) { $outroMetodo = true; continue; }
      $params = array_filter($m, 'is_string', ARRAY_FILTER_USE_KEY);
      $this->guardar($r['acesso'], $metodo);
      $saida = ($r['fn'])($params);
      if ($saida !== null) psi_json($saida);
      return;
    }
    if ($outroMetodo) psi_erro('Método não suportado.', 405);
    psi_erro('Não encontrado.', 404);
  }

  private function guardar(string $acesso, string $metodo): void {
    if ($acesso === 'livre' || $acesso === 'admin') return; // admin: a própria rota confere o Basic
    psi_exigir_liberado();
    if ($acesso === 'publica') return;
    psi_exigir_login();
    if ($metodo !== 'GET') {
      psi_exigir_csrf();
      if ($acesso === 'login') psi_exigir_escrita();
    }
  }
}
