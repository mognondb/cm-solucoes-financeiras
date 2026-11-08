<?php
/**
 * Página de configuração única: cria (ou redefine) o usuário administrador
 * mestre direto no banco MySQL. Abra esta página pelo navegador, preencha
 * usuário e senha, e DEPOIS APAGUE ESTE ARQUIVO pelo Gerenciador de Arquivos
 * da Hostinger — ele não deve continuar acessível publicamente.
 */
declare(strict_types=1);
require __DIR__ . '/db.php';

$db = cmDb();
$jaExisteAdmin = (int)$db->query("SELECT COUNT(*) AS n FROM usuarios WHERE papel = 'admin'")->fetch()['n'] > 0;

$mensagem = null;
$erro = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $username = trim($_POST['username'] ?? '');
  $senha = $_POST['senha'] ?? '';
  $nome = trim($_POST['nome'] ?? '') ?: $username;
  if ($username === '' || strlen($senha) < 6) {
    $erro = 'Preencha um usuário e uma senha de pelo menos 6 caracteres.';
  } else {
    $saltHex = bin2hex(random_bytes(16));
    $hashHex = bin2hex(hash_pbkdf2('sha256', $senha, hex2bin($saltHex), 100000, 32, true));
    $agora = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z');
    $stmt = $db->prepare('INSERT INTO usuarios (username, nome, papel, cliente_id, relatorio_id, ativo, salt_hex, hash_hex, criado_em, atualizado_em)
      VALUES (?,?,\'admin\',NULL,NULL,1,?,?,?,?)
      ON DUPLICATE KEY UPDATE nome=VALUES(nome), papel=\'admin\', ativo=1, salt_hex=VALUES(salt_hex), hash_hex=VALUES(hash_hex), atualizado_em=VALUES(atualizado_em)');
    $stmt->execute([$username, $nome, $saltHex, $hashHex, $agora, $agora]);
    $mensagem = 'Usuário administrador salvo. Agora apague este arquivo (api/setup.php) pelo Gerenciador de Arquivos da Hostinger.';
    $jaExisteAdmin = true;
  }
}
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Configuração inicial</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 420px; margin: 60px auto; padding: 0 20px; color: #222; }
  label { display: block; margin-top: 14px; font-size: 14px; }
  input { width: 100%; padding: 8px; margin-top: 4px; box-sizing: border-box; }
  button { margin-top: 20px; padding: 10px 16px; }
  .ok { background: #e6f6e6; padding: 12px; border-radius: 6px; margin-top: 16px; }
  .erro { background: #fde; padding: 12px; border-radius: 6px; margin-top: 16px; }
  .aviso { background: #fff3cd; padding: 12px; border-radius: 6px; margin-top: 16px; font-size: 14px; }
</style>
</head>
<body>
<h1>Configuração inicial do admin</h1>
<?php if ($jaExisteAdmin && $_SERVER['REQUEST_METHOD'] !== 'POST'): ?>
  <div class="aviso">Já existe um administrador cadastrado. Enviar este formulário cria outro ou substitui um existente com o mesmo usuário.</div>
<?php endif; ?>
<?php if ($mensagem): ?><div class="ok"><?= htmlspecialchars($mensagem) ?></div><?php endif; ?>
<?php if ($erro): ?><div class="erro"><?= htmlspecialchars($erro) ?></div><?php endif; ?>
<form method="post">
  <label>Usuário<input type="text" name="username" required></label>
  <label>Nome<input type="text" name="nome"></label>
  <label>Senha<input type="password" name="senha" minlength="6" required></label>
  <button type="submit">Salvar administrador</button>
</form>
</body>
</html>
