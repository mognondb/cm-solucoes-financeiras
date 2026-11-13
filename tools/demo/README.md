# Cliente "Demonstrativo"

Página `portal/relatorios/demo.html`: cópia do relatório Premium com empresa, obras, pessoas e valores **100% fictícios**
(Atlas Pinturas Prediais), para gravar vídeos e posts. É um arquivo **gerado**; não edite à mão.

- `build_demo.py` gera o `demo.html` a partir do `premium.html`.
- `demo_gen.js` monta o extrato fictício (formato Conta Azul) com datas relativas a hoje.

```
python3 tools/demo/build_demo.py
```

O cliente e o relatório aparecem no portal sozinhos: `garantirClienteDemonstrativo()` em `api/index.php` cria o cliente
`demonstrativo` uma única vez (marcador na tabela `migracoes`). Para o login do cliente, crie um usuário no painel admin
com papel "cliente" ligado ao cliente "Demonstrativo".
