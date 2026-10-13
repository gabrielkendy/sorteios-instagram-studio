# Sorteios Instagram Studio

**Painel open source para fazer sorteio de comentários do Instagram com prova auditável.**

Cole a URL de um post ou Reel público, importe os comentários, configure as regras de participação, sorteie com aleatoriedade criptográfica e receba a **arte do ganhador pronta** em PNG 1080x1920 — mais um **comprovante JSON** que registra link, regras, quantidade, hash da lista e o número sorteado.

Roda no seu computador. **Zero dependências npm.** Node.js puro, HTML/CSS/JS e Canvas.

```
Node.js 18+  ·  sem build  ·  sem banco de dados  ·  MIT
```

---

## Por que existe

Fazer sorteio de Instagram no "olhômetro" gera desconfiança, e desconfiança em promoção é prejuízo.

Este projeto resolve o problema com três coisas:

1. **Aleatoriedade de verdade.** Sorteio via `crypto.getRandomValues` com rejeição de amostras — sem viés de módulo, ao contrário do `Math.random()`.
2. **Prova verificável.** Um JSON com data/hora, link, regras aplicadas, total de comentários, perfis elegíveis, SHA-256 da lista, número aleatório e posição sorteada.
3. **Entrega pronta.** A arte do ganhador sai gerada, no formato de Story ou Feed, com a marca configurada.

---

## Começar em 3 passos

### 1. Instale o Node.js

Versão 18 ou superior: <https://nodejs.org/>

### 2. Baixe e entre na pasta

```bash
git clone https://github.com/gabrielkendy/sorteios-instagram-studio.git
cd sorteios-instagram-studio
```

### 3. Rode

```bash
npm start
```

Abra **<http://127.0.0.1:3214>** no navegador. Pronto.

> O painel sobe apenas em `127.0.0.1` por padrão. Ele **não** fica exposto na rede nem na internet sem que você configure senha e proxy — de propósito.

---

## Como fazer o sorteio

### 1. Importar os comentários

Cole a URL pública completa do post ou Reel:

```
https://www.instagram.com/p/XXXXXXXXXXX/
https://www.instagram.com/reel/XXXXXXXXXXX/
```

O painel mostra a capa do post, o autor e a contagem, para você confirmar que é a publicação certa antes de coletar.

**Duas formas de trazer os comentários:**

| Modo | Como funciona | Precisa de quê |
|---|---|---|
| **Por link** | Coleta automática dos comentários públicos | Token da [Apify](https://console.apify.com/account/integrations) |
| **Por arquivo** | Importa CSV, JSON ou TXT que você já tenha | Nada |

O modo por arquivo existe porque a coleta automática é a parte frágil de qualquer ferramenta de sorteio: depende do que o Instagram entrega, da política do ator de scraping e da sua verba. Ter o caminho por arquivo significa que **o sorteio nunca fica refém de uma API de terceiro**.

**Formatos aceitos:**

```csv
username,text,ownerProfilePic
fulano,"Quero participar! @amigo",abc123.jpg
```

```txt
um_usuario_por_linha
```

### 2. Configurar as regras

| Regra | O que faz |
|---|---|
| **Prêmio** | Nome do prêmio, aparece na arte |
| **Palavra obrigatória** | Só entra quem escreveu a palavra (ex.: `SORTEIO`) |
| **Mínimo de @menções** | Exige marcar N amigos |
| **Perfis excluídos** | Remove da lista quem não pode ganhar |
| **Só comentários principais** | Ignora respostas |
| **Contar uma vez por perfil** | Vários comentários da mesma pessoa contam 1 |

O painel mostra em tempo real **quantos comentários entraram** e **quantos perfis ficaram elegíveis**. Essa diferença é o que a maioria das ferramentas esconde.

### 3. Sortear

Clique em **SORTEAR**. Dois caminhos:

- **Direto no painel** — define o ganhador na hora e monta a arte
- **Roleta em tela cheia** — animação de contagem que desacelera e para no ganhador. É o formato para gravar vídeo do sorteio.

### 4. Baixar

| Arquivo | O que é |
|---|---|
| **Arte do ganhador** | PNG 1080×1920 (Story) ou 1080×1350 (Feed) |
| **Comprovante JSON** | Registro do sorteio com hashes e o número sorteado |
| **CSV dos participantes** | Lista elegível completa |

---

## A arte do ganhador

A arte é gerada em Canvas e usa um **modelo de fundo** (`public/arte/MODELO-GANHADOR.png`) com dois pontos de encaixe:

- **Círculo** — onde a foto do ganhador entra, recortada em círculo
- **Caixa de nome** — onde o @handle entra, com a fonte ajustada à largura

Para trocar o layout, substitua o PNG do modelo e ajuste as coordenadas no topo de `public/js/app.js`:

```js
// Coordenadas medidas no modelo, na escala do arquivo original
const CIRCULO  = { cx: 470, cy: 744, r: 166 };   // centro x, centro y, raio
const CAIXA    = { x0: 102, y0: 1005, x1: 837, y1: 1090 };
```

O script `arte-modelo.py` faz o mesmo trabalho fora do painel, em Python, para gerar a arte em lote:

```bash
python arte-modelo.py caminho/da/foto.jpg "@nome_do_ganhador"
# -> gravacao/ARTE-MODELO.png em 1080x1920
```

---

## Configuração

Copie `.env.example` para `.env.local`:

```bash
cp .env.example .env.local
```

```ini
APIFY_TOKEN=apify_api_xxxxxxxxxxxxxxxxxxxx
PORT=3214
HOST=127.0.0.1
PANEL_PASSWORD=
```

| Variável | Para que serve |
|---|---|
| `APIFY_TOKEN` | Token da Apify para coletar comentários por link |
| `PORT` | Porta do painel (padrão `3214`) |
| `HOST` | Interface de escuta (padrão `127.0.0.1`) |
| `PANEL_PASSWORD` | Senha obrigatória se você mudar o `HOST` |

**Prefere não salvar token no disco?** Deixe `APIFY_TOKEN` vazio e cole o token pelo botão **CONFIGURAR API** dentro do painel. Ele fica no `sessionStorage` da aba e desaparece ao fechar — nada é gravado.

> Se `HOST` for diferente de `127.0.0.1`, o servidor **exige** `PANEL_PASSWORD` e recusa o bind sem ela. Ele não se expõe na rede por acidente.

---

## Marca

O painel nasce genérico. Onde aparecer `MARCA`, `SUA MARCA` ou `NOME_DA_SUA_MARCA`, é o ponto de configuração da sua identidade.

Para trocar a logo, use o botão **TROCAR LOGO DA MARCA** na tela da arte, ou substitua os arquivos em `public/assets/`:

```
public/assets/logo-nechio.png        logo principal
public/assets/logo-fallback.svg      usado se a principal faltar
```

Se a sua marca tiver logo online, ajuste a URL no `server.mjs`. Se estiver offline, o `logo-fallback.svg` entra no lugar.

---

## Testes

```bash
npm test
```

Seis testes de integração com **API simulada**. Eles não acessam a Apify real e não custam nada:

```
✔ responde estado saudável e não revela o segredo
✔ recusa URL diferente do Instagram
✔ recusa chamada cross-site
✔ importa pelo link, pagina via dataset e preserva usernames
✔ não expõe o código do servidor publicamente
✔ rejeita caminhos inválidos com status apropriado
```

---

## Segurança

- **Escuta só em localhost** por padrão.
- **Sem token hardcoded.** O token é lido de `.env.local` (que não vai para o Git) ou digitado no painel.
- **Proteção cross-site.** O servidor recusa chamadas de outra origem.
- **O código do servidor não é servido** como arquivo estático.
- **Path traversal bloqueado** por normalização de caminho.

O `.env.local` **nunca** é versionado. Ele já está no `.gitignore`.

---

## Privacidade e LGPD

Este projeto lida com dados de pessoas reais. Levando a sério:

- **Comentários ficam só na memória do servidor** durante a importação e na aba do navegador. Nada é gravado em banco.
- **Avatares de participantes reais não são versionados.** `public/fotos/` está no `.gitignore`. Se você coletar um sorteio real, os avatares ficam na sua máquina, não no repositório.
- **Base de comentários não vai para o Git.** Qualquer `.csv` em `gravacao/` está ignorado.
- **Exporte só o que precisa.** Divulgar a lista completa de participantes raramente é necessário. O comprovante JSON já prova o resultado sem expor a lista.

Se for usar em promoção comercial, revise o regulamento e as regras do Instagram aplicáveis na sua jurisdição.

---

## O que este projeto NÃO garante

Vale ser direto, porque ferramenta de sorteio que promete demais é ferramenta que decepciona:

- **Não garante 100% dos comentários.** Nenhuma ferramenta garante, sem as permissões oficiais da Meta. A coleta depende do que o Instagram entrega e da política do ator. **Compare sempre o total com o que a publicação exibe.**
- **O comprovante não é auditoria independente.** Ele prova o que o programa fez, no seu computador, com a lista que ele recebeu. Ele não prova que a lista continha todos os comentários existentes.
- **Não verifica seguir/curtir.** Essas regras precisam de conferência manual.
- **Conformidade legal é sua.** Regulamento, tributos e regras de plataforma variam por país.

Para dar transparência máxima: **grave a tela** durante o sorteio. É o método mais forte, e o painel foi feito pensando nisso.

---

## Estrutura do projeto

```
sorteios-instagram-studio/
├── server.mjs                 servidor HTTP, rotas e coleta
├── arte-modelo.py             gerador da arte em Python (lote/CLI)
├── package.json
├── .env.example               modelo de configuracao
├── .gitignore
├── LICENSE                    MIT
├── README.md
├── public/
│   ├── index.html             o painel
│   ├── css/
│   ├── js/
│   │   ├── app.js             logica do painel: importar, regras, arte
│   │   └── roleta.js          a roleta em tela cheia
│   ├── arte/
│   │   └── MODELO-GANHADOR.png   modelo de fundo da arte
│   └── assets/                logos
├── tests/                     testes de integracao (API simulada)
└── gravacao/                  saida local (videos, quadros) - ignorado
```

---

## Armadilhas conhecidas

| Problema | Causa | Solução |
|---|---|---|
| `HTTP 402` na importação por link | Crédito da Apify esgotado | Use o modo por arquivo, ou ponha crédito na Apify |
| Menos comentários do que o post mostra | Limite do ator de scraping | Aumente o limite de coleta; compare com a publicação |
| Arte sem a foto do ganhador | Sorteio feito no painel, não pela roleta | A foto viaja com a roleta. Use a roleta, ou passe `--foto` no script |
| Porta 3214 ocupada | Outro processo usando | Mude `PORT` no `.env.local` |

---

## Contribuir

Issue e pull request são bem-vindos. Se for mexer na aleatoriedade ou no comprovante, **inclua o teste** — essas duas partes são o motivo do projeto existir.

---

## Licença

MIT. Use, modifique, venda, distribua. Veja [LICENSE](LICENSE).

---

Feito para quem precisa provar que o sorteio foi limpo.
