# Testar o app com o agent-browser

Ferramenta instalada para conferir fluxo de verdade — clicar, preencher, ver o
que a tela responde — em vez de só confiar que o build passou.

```bash
npm i -g agent-browser && agent-browser install
```

## Regras que este projeto aprendeu na prática

**Sempre uma sessão nomeada.** Sem `AGENT_BROWSER_SESSION` o navegador é
compartilhado com qualquer outro agente da máquina e persiste entre conversas —
dá para sequestrar a aba de outra tarefa sem perceber.

```powershell
$env:AGENT_BROWSER_SESSION = "sushiart"
```

**Rodar pelo PowerShell, não pelo bash com pipe.** `agent-browser snapshot | head`
no Git Bash trava: o `head` fecha o cano e o processo fica pendurado. Capture a
saída numa variável.

```powershell
$s = agent-browser snapshot -i 2>&1 | Out-String
```

**Os refs (`@e1`, `@e2`) morrem a cada mudança de página.** Depois de clicar em
algo que navega, submete formulário ou abre modal, tire outro snapshot antes de
usar qualquer ref.

## O ciclo

```powershell
agent-browser open "http://127.0.0.1:4198/cardapio"
agent-browser snapshot -i          # ve o que existe, com refs
agent-browser click @e12           # age
agent-browser snapshot -i          # re-snapshot, porque a pagina mudou
agent-browser screenshot tela.png
```

## O que testar antes de dizer que terminou

Mudou algo no app do cliente, passe por estes:

- **Cardápio** — abre, categorias filtram, card abre a ficha do produto
- **Carrinho** — adiciona, muda quantidade, remove
- **Checkout** — endereço, forma de pagamento, valor final
- **Login** — e-mail/senha, olho da senha, botão do Google
- **Ofertas** — roleta gira, cupom aparece
- **Painel** — pedidos mudam de status, cardápio salva

Servidor local:

```powershell
npm run build
npx vite preview --port 4198 --host 127.0.0.1
```

Conta de teste: `sushiart@gmail.com`
