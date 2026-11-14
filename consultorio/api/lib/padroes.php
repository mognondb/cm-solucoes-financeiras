<?php
/** Dados iniciais de cada conta nova: as categorias e formas de pagamento da Planilha de Controle Financeiro para Psicólogos da CM. */
declare(strict_types=1);

const PSI_FORMAS = [
  'dinheiro' => 'Dinheiro', 'pix' => 'PIX', 'debito' => 'Cartão de débito', 'credito' => 'Cartão de crédito',
  'transferencia' => 'Transferência bancária', 'boleto' => 'Boleto', 'convenio' => 'Convênio / plano de saúde',
  'debito_automatico' => 'Débito automático', 'cheque' => 'Cheque', 'outro' => 'Outro',
];

/** [nome, grupo, dedutível no livro-caixa (sugestão; o contador confirma), descrição] */
function psi_categorias_despesa_padrao(): array {
  return [
    ['Aluguel do consultório', 'fixa', 1, 'Aluguel mensal da sala ou do espaço de atendimento'],
    ['Condomínio e IPTU', 'fixa', 1, 'Taxa de condomínio, IPTU e taxas do imóvel'],
    ['Energia elétrica', 'variavel', 1, 'Conta de luz do consultório'],
    ['Água e esgoto', 'variavel', 1, 'Conta de água do consultório'],
    ['Internet e telefonia', 'fixa', 1, 'Internet, telefone fixo e celular usados no trabalho'],
    ['Software e sistemas', 'fixa', 1, 'Agenda online, assinatura de plataformas de videochamada, este sistema'],
    ['Material de escritório', 'variavel', 1, 'Papel, canetas, impressos, testes em papel, cartuchos'],
    ['Material de consumo e limpeza', 'variavel', 1, 'Café, água, copos, lenços, produtos de limpeza'],
    ['Manutenção e reformas', 'variavel', 1, 'Pintura, conserto de ar-condicionado, pequenos reparos'],
    ['Mobiliário e equipamentos', 'variavel', 0, 'Poltrona, divã, computador, testes psicológicos, ar-condicionado'],
    ['Marketing e divulgação', 'variavel', 1, 'Tráfego pago, site, cartão de visita, redes sociais, fotógrafo'],
    ['Salários e encargos', 'fixa', 1, 'Secretária, recepcionista, FGTS, INSS e demais encargos'],
    ['Serviços de terceiros', 'variavel', 1, 'Contabilidade, faxina, advogado, TI'],
    ['Supervisão clínica', 'fixa', 1, 'Supervisão individual ou em grupo paga a outro profissional'],
    ['Cursos e formação continuada', 'variavel', 1, 'Congressos, pós-graduação, cursos, livros técnicos'],
    ['Conselho e anuidades (CRP)', 'fixa', 1, 'Anuidade do CRP, associações e entidades de classe'],
    ['Impostos e taxas', 'variavel', 0, 'DAS, ISS, IRPF/IRPJ, taxas bancárias'],
    ['Taxas de maquininha e gateway', 'variavel', 1, 'Taxa da máquina de cartão, PagSeguro, Mercado Pago, PIX cobrado'],
    ['Seguros', 'fixa', 1, 'Seguro do imóvel, seguro de responsabilidade civil profissional'],
    ['Transporte e deslocamento', 'variavel', 0, 'Combustível, aplicativo, estacionamento, viagem a atendimento'],
    ['Pró-labore / retirada do sócio', 'fixa', 0, 'Valor retirado pelo profissional como remuneração'],
    ['Outras despesas', 'variavel', 0, 'Use só quando não existir categoria adequada e explique nas observações'],
  ];
}
function psi_categorias_receita_padrao(): array {
  return [
    ['Sessão individual - particular', 'Atendimento individual pago diretamente pelo paciente'],
    ['Sessão individual - convênio/plano', 'Atendimento faturado para plano de saúde ou convênio'],
    ['Terapia de casal', 'Sessões com casal'],
    ['Terapia familiar', 'Sessões com família'],
    ['Atendimento infantil / adolescente', 'Sessões com crianças e adolescentes'],
    ['Atendimento em grupo', 'Grupos terapêuticos e oficinas'],
    ['Avaliação psicológica / laudo', 'Testagem, laudos, relatórios e pareceres'],
    ['Psicoterapia online', 'Atendimentos por videochamada'],
    ['Palestra / workshop', 'Palestras em empresas, escolas e eventos'],
    ['Supervisão prestada', 'Supervisão que você oferece a outros profissionais'],
    ['Curso / treinamento ministrado', 'Cursos e formações que você vende'],
    ['Aluguel de sala a colegas', 'Valor recebido por ceder a sala em horários livres'],
    ['Outras receitas', 'Reembolsos, juros recebidos e itens sem categoria própria'],
  ];
}
/** Tipos de atendimento: [nome, minutos, categoria de receita, tipo do paciente] */
function psi_servicos_padrao(): array {
  return [
    ['Sessão individual', 50, 'Sessão individual - particular', 'individual'],
    ['Terapia de casal', 60, 'Terapia de casal', 'casal'],
    ['Atendimento infantil', 50, 'Atendimento infantil / adolescente', 'infantil'],
    ['Psicoterapia online', 50, 'Psicoterapia online', 'individual'],
    ['Avaliação psicológica', 60, 'Avaliação psicológica / laudo', 'individual'],
  ];
}
/** Cria os dados iniciais de uma conta recém-criada. */
function psi_semear_conta(PDO $db, int $contaId, string $nomeProfissional, string $hoje): int {
  $agora = psi_agora();
  $db->prepare('INSERT INTO psi_profissionais (conta_id, nome, criado_em) VALUES (?,?,?)')->execute([$contaId, $nomeProfissional, $agora]);
  $profId = (int)$db->lastInsertId();
  $cat = $db->prepare('INSERT INTO psi_categorias (conta_id, tipo, nome, grupo, dedutivel, descricao, ordem) VALUES (?,?,?,?,?,?,?)');
  $o = 0; foreach (psi_categorias_despesa_padrao() as $c) $cat->execute([$contaId, 'despesa', $c[0], $c[1], $c[2], $c[3], $o++]);
  $o = 0; $ids = [];
  foreach (psi_categorias_receita_padrao() as $c) { $cat->execute([$contaId, 'receita', $c[0], 'receita', 0, $c[1], $o++]); $ids[$c[0]] = (int)$db->lastInsertId(); }
  $srv = $db->prepare('INSERT INTO psi_servicos (conta_id, nome, duracao_min, valor, categoria_id, ordem) VALUES (?,?,?,?,?,?)');
  $o = 0; foreach (psi_servicos_padrao() as $s) $srv->execute([$contaId, $s[0], $s[1], 0, $ids[$s[2]] ?? null, $o++]);
  $cf = $db->prepare('INSERT INTO psi_contas_fin (conta_id, tipo, nome, saldo_inicial, data_saldo, ordem, criado_em) VALUES (?,?,?,?,?,?,?)');
  $cf->execute([$contaId, 'banco', 'Conta principal', 0, $hoje, 0, $agora]);
  $cf->execute([$contaId, 'carteira', 'Dinheiro', 0, $hoje, 1, $agora]);
  return $profId;
}
