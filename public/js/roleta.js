/* ==========================================================================
   SORTEIO AO VIVO — NOME_DA_SUA_MARCA SORTEIOS STUDIO  (v4 — CORRIDA 0 → TOTAL)
   Pedido do cliente:
     - O contador percorre TODOS os comentarios (ex.: 0 → 419), igual roleta
     - Desacelera e TRAVA no numero do comentario ganhador
     - Depois mostra o campeao (foto + @)
     - 1 ganhador

   Expõe: window.MarcaRoleta.abrir(pessoas, qtd, {premio, total, aoFechar})
     pessoas: [{handle, foto, comentario}, ...]
     total:   numero mostrado na etiqueta (ex.: 419) — a corrida vai de 0 ate ele
   ========================================================================== */
(function () {
  'use strict';

  var VERDE = '#c8e64a';
  var LOGO = '/assets/logo.png';

  function injetarCSS() {
    if (document.getElementById('roleta-css')) return;
    var s = document.createElement('style');
    s.id = 'roleta-css';
    s.textContent = [
      '.rt-overlay{position:fixed;inset:0;z-index:9999;background:radial-gradient(120% 80% at 50% 0%,#1a0d18 0%,#0b0c12 55%,#08090e 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:26px;font-family:"DM Sans",system-ui,sans-serif;opacity:0;transition:opacity .3s ease}',
      '.rt-overlay.rt-on{opacity:1}',
      '.rt-logo{width:min(58vw,232px);display:block;filter:drop-shadow(0 10px 30px rgba(140,20,70,.45))}',
      '.rt-topo{text-align:center;color:#fff;position:relative;z-index:3;display:flex;flex-direction:column;align-items:center;gap:12px}',
      '.rt-kicker{font:600 11px/1 "DM Sans";letter-spacing:.24em;color:' + VERDE + ';text-transform:uppercase}',

      /* ---- JANELA DA CORRIDA ---- */
      '.rt-palco{position:relative;width:min(86vw,470px);display:flex;flex-direction:column;align-items:center;gap:14px}',
      '.rt-janela{position:relative;width:100%;height:min(32vw,164px);border-radius:24px;background:linear-gradient(180deg,#14161f,#101219);border:1px solid #2a2e3a;overflow:hidden;display:flex;align-items:center;justify-content:center;box-shadow:0 26px 60px rgba(0,0,0,.6),inset 0 0 60px rgba(200,230,74,.05)}',
      '.rt-janela::before,.rt-janela::after{content:"";position:absolute;left:0;right:0;height:30%;pointer-events:none;z-index:2}',
      '.rt-janela::before{top:0;background:linear-gradient(180deg,rgba(10,11,16,.88),transparent)}',
      '.rt-janela::after{bottom:0;background:linear-gradient(0deg,rgba(10,11,16,.88),transparent)}',
      '.rt-num{font:900 min(15vw,66px)/1 "Montserrat",sans-serif;color:#fff;letter-spacing:-.02em;white-space:nowrap;padding:0 16px;text-align:center;font-variant-numeric:tabular-nums}',
      '.rt-num.rt-travado{color:' + VERDE + ';text-shadow:0 0 34px rgba(200,230,74,.5);animation:rt-sela .45s cubic-bezier(.2,1.5,.4,1)}',
      '@keyframes rt-sela{0%{transform:scale(.86)}60%{transform:scale(1.07)}100%{transform:scale(1)}}',
      '.rt-janela.rt-ok{border-color:' + VERDE + ';box-shadow:0 0 0 2px rgba(200,230,74,.35),0 26px 70px rgba(200,230,74,.22)}',
      '.rt-faixa{font:700 min(4.6vw,16px)/1 "DM Sans";letter-spacing:.1em;color:#8b8f9e;text-transform:uppercase;text-align:center;min-height:16px}',

      /* ---- CARD FINAL ---- */
      '.rt-final{display:flex;flex-direction:column;align-items:center;animation:rt-sobe .65s cubic-bezier(.2,1.15,.35,1)}',
      '@keyframes rt-sobe{0%{opacity:0;transform:translateY(26px) scale(.94)}100%{opacity:1;transform:translateY(0) scale(1)}}',
      '.rt-moldura{width:min(46vw,168px);aspect-ratio:1;border-radius:50%;padding:5px;background:linear-gradient(140deg,' + VERDE + ',#4ade80 55%,' + VERDE + ');box-shadow:0 0 52px rgba(200,230,74,.42)}',
      '.rt-foto{width:100%;height:100%;border-radius:50%;object-fit:cover;background:#22252f;display:flex;align-items:center;justify-content:center;font:800 46px "Montserrat",sans-serif;color:' + VERDE + '}',
      '.rt-selo{margin-top:-13px;background:' + VERDE + ';color:#0b0c12;font:800 10px/1 "DM Sans";letter-spacing:.15em;padding:7px 16px;border-radius:99px;z-index:4;box-shadow:0 8px 22px rgba(0,0,0,.55)}',
      '.rt-nome{font:800 min(7.4vw,30px)/1.1 "Montserrat",sans-serif;color:#fff;margin:16px 0 0;text-align:center;word-break:break-word;max-width:92vw}',
      '.rt-coment{font:500 13px/1.45 "DM Sans";color:#9aa0b0;margin:10px 0 0;text-align:center;max-width:86vw;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',

      '.rt-acoes{display:flex;gap:10px;margin-top:6px;flex-wrap:wrap;justify-content:center;position:relative;z-index:3}',
      '.rt-btn{font:700 12px/1 "DM Sans";letter-spacing:.05em;padding:14px 24px;border-radius:10px;border:1px solid #2a2e3a;background:#161822;color:#e7e9ee;cursor:pointer;transition:.2s}',
      '.rt-btn:hover{background:#1e2130;border-color:#3a3f4d}',
      '.rt-btn.rt-primario{background:' + VERDE + ';color:#0b0c12;border-color:' + VERDE + '}',
      '.rt-btn.rt-primario:hover{background:#d6f055}',
      '.rt-btn[disabled]{opacity:.55;cursor:default}',
      '.rt-confete{position:fixed;inset:0;pointer-events:none;z-index:9998;overflow:hidden}',
      '.rt-confete i{position:absolute;top:-20px;width:8px;height:14px;opacity:.9;animation:rt-cai linear forwards}',
      '@keyframes rt-cai{to{transform:translateY(105vh) rotate(680deg);opacity:0}}'
    ].join('');
    document.head.appendChild(s);
  }

  function escapa(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function iniciais(handle) {
    var t = String(handle || '?').replace(/^@/, '').trim();
    return (t[0] || '?').toUpperCase();
  }

  function fotoHTML(p, classe) {
    var ini = iniciais(p && p.handle);
    if (p && p.foto) {
      return '<div class="' + classe + '"><img src="' + escapa(p.foto) + '" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block" onerror="this.parentNode.innerHTML=\'' + ini + '\'"></div>';
    }
    return '<div class="' + classe + '">' + ini + '</div>';
  }

  function confete() {
    var c = document.createElement('div');
    c.className = 'rt-confete';
    var cores = [VERDE, '#e85c7a', '#6ad1e8', '#f2b544', '#9b7ce8', '#4ade80'];
    for (var i = 0; i < 44; i++) {
      var p = document.createElement('i');
      p.style.left = Math.random() * 100 + '%';
      p.style.background = cores[i % cores.length];
      p.style.animationDuration = (2.3 + Math.random() * 1.7) + 's';
      p.style.animationDelay = (Math.random() * .6) + 's';
      c.appendChild(p);
    }
    document.body.appendChild(c);
    setTimeout(function () { c.remove(); }, 5200);
  }

  // Sorteia indices com entropia criptografica (Fisher-Yates, sem vies).
  function sortear(total, qtd) {
    var pool = [];
    for (var i = 0; i < total; i++) pool.push(i);
    for (var j = pool.length - 1; j > 0; j--) {
      var r = Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296) * (j + 1));
      var t = pool[j]; pool[j] = pool[r]; pool[r] = t;
    }
    return pool.slice(0, qtd);
  }

  function aleatorio(n) {
    return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296 * n;
  }

  /**
   * Abre o sorteio ao vivo.
   * @param {Array}  pessoas [{handle, foto, comentario}]
   * @param {number} qtd     ganhadores
   * @param {Object} opcoes  {premio, total, aoFechar}
   */
  function abrir(pessoas, qtd, opcoes) {
    opcoes = opcoes || {};
    pessoas = (pessoas || []).filter(function (p) { return p && p.handle; });
    qtd = Math.max(1, Math.min(parseInt(qtd, 10) || 1, pessoas.length));

    if (!pessoas.length) { alert('Nenhum participante elegivel para sortear.'); return []; }

    injetarCSS();

    // TOTAL da corrida = numero que o cliente ve na etiqueta (ex.: 419).
    // Se nao vier, usa o tamanho real da base.
    var TOTAL = parseInt(opcoes.total, 10);
    if (!(TOTAL > 0)) TOTAL = pessoas.length;

    var escolhidos = sortear(pessoas.length, qtd);
    var vencedores = escolhidos.map(function (i) { return pessoas[i]; });
    // Numero do comentario que ganha, dentro da faixa 0..TOTAL
    var numeros = escolhidos.map(function (i) {
      var meio = Math.round((i + 0.5) / pessoas.length * TOTAL);
      return Math.max(1, Math.min(TOTAL, meio));
    });

    var ov = document.createElement('div');
    ov.className = 'rt-overlay rt-on';
    ov.innerHTML =
      '<div class="rt-topo">' +
        '<img class="rt-logo" src="' + LOGO + '" alt="Logo">' +
        '<div class="rt-kicker">SORTEIO AO VIVO</div>' +
      '</div>' +
      '<div class="rt-palco">' +
        '<div class="rt-janela"><div class="rt-num" id="rtNum">000</div></div>' +
        '<div class="rt-faixa" id="rtFaixa">' + (opcoes.premio ? escapa(opcoes.premio) : 'Sorteando agora') + '</div>' +
      '</div>' +
      '<div class="rt-acoes" id="rtAcoes"><button class="rt-btn rt-primario" id="rtGirar">COMEÇAR O SORTEIO</button></div>';
    document.body.appendChild(ov);

    var elNum = ov.querySelector('#rtNum');
    var elJanela = ov.querySelector('.rt-janela');
    var elFaixa = ov.querySelector('#rtFaixa');
    var elGirar = ov.querySelector('#rtGirar');

    var girando = false;
    var revelados = 0;

    // A CORRIDA: 3 SEGUNDOS correndo a faixa 0 → TOTAL (ex.: 0 → 419), passando
    // NO MINIMO 4 VEZES por ela em velocidade alta. Depois desacelera e trava
    // num numero aleatorio. Igual roleta de verdade.
    function corre(desacelera, aoTravar) {
      var CORRIDA = 3000;                            // 3s de corrida rapida (pedido do cliente)
      var FREIO   = 2600;                            // freio depois, parando devagar
      var DURACAO = desacelera ? (CORRIDA + FREIO) : 0;
      var inicio = performance.now();
      var alvo = numeros[revelados];
      // 4 a 6 voltas completas na faixa = sempre passa MAIS de 4 vezes
      var voltas = 4 + Math.floor(aleatorio(3));
      var topo = TOTAL * (voltas + 0.15 + aleatorio(0.7)); // termina no meio da faixa
      var ultimoPintado = -1;

      function passo(agora) {
        var dt = (agora - inicio) / DURACAO;
        dt = Math.min(Math.max(dt, 0), 1);

        var t;
        if (agora - inicio < CORRIDA) {
          // FASE 1 — 3 SEGUNDOS A VELOCIDADE CONSTANTE: atravessa a faixa 4+ vezes.
          t = topo * ((agora - inicio) / CORRIDA);
        } else {
          // FASE 2 — FREIO: easeOutQuint, vai pisando e para devagar no alvo.
          var g = Math.min((agora - inicio - CORRIDA) / FREIO, 1);
          var suave = 1 - Math.pow(1 - g, 5);
          t = topo + (alvo - topo) * suave;
        }

        var pintar = Math.floor(t) % (TOTAL + 1);
        if (pintar !== ultimoPintado) {
          ultimoPintado = pintar;
          elNum.textContent = String(Math.max(0, pintar)).padStart(3, '0');
        }

        if (dt < 1) {
          requestAnimationFrame(passo);
        } else {
          elNum.textContent = String(alvo).padStart(3, '0');
          elNum.classList.add('rt-travado');
          elJanela.classList.add('rt-ok');
          setTimeout(aoTravar, 620);
        }
      }
      requestAnimationFrame(passo);
    }

    function proximo() {
      girando = false;
      revelados++;
      if (revelados < qtd) {
        elNum.classList.remove('rt-travado');
        elJanela.classList.remove('rt-ok');
        elFaixa.textContent = 'GANHADOR ' + revelados + ' DE ' + qtd;
        elGirar.disabled = false;
        elGirar.textContent = 'SORTEAR O ' + (revelados + 1) + 'º GANHADOR';
      } else {
        elGirar.disabled = true;
        elGirar.textContent = 'SORTEADO';
        setTimeout(mostraFinal, 760);
      }
    }

    function mostraFinal() {
      confete();
      var cards = vencedores.map(function (p, i) {
        var extra = i === 0 ? '' : ' style="margin-top:38px"';
        return '<div class="rt-final"' + extra + '>' +
          fotoHTML(p, 'rt-moldura') +
          '<div class="rt-selo">NOME_DA_SUA_MARCA' + (qtd > 1 ? ' ' + (i + 1) + 'º' : '') + '</div>' +
          '<h3 class="rt-nome">@' + escapa(String(p.handle).replace(/^@/, '')) + '</h3>' +
          (p.comentario ? '<p class="rt-coment">"' + escapa(String(p.comentario).slice(0, 180)) + '"</p>' : '') +
        '</div>';
      }).join('');

      ov.innerHTML =
        '<div class="rt-topo">' +
          '<img class="rt-logo" src="' + LOGO + '" alt="Logo">' +
          '<div class="rt-kicker">RESULTADO DO SORTEIO</div>' +
        '</div>' +
        cards +
        '<div class="rt-acoes">' +
          '<button class="rt-btn rt-primario" id="rtBaixar">BAIXAR A ARTE</button>' +
          '<button class="rt-btn" id="rtFechar">CONTINUAR NO PAINEL</button>' +
        '</div>';

      ov.querySelector('#rtBaixar').addEventListener('click', async function () {
        var b = ov.querySelector('#rtBaixar');
        b.textContent = 'GERANDO...';
        b.disabled = true;
        try {
          var fn = window.MarcaRoleta && window.MarcaRoleta.baixarArte;
          var ok = (typeof fn === 'function') ? await fn(vencedores) : false;
          b.textContent = ok ? 'ARTE BAIXADA \u2713' : 'TENTE DE NOVO';
          if (ok) setTimeout(function () { b.textContent = 'BAIXAR A ARTE'; b.disabled = false; }, 2400);
          else b.disabled = false;
        } catch (e) { b.textContent = 'TENTE DE NOVO'; b.disabled = false; }
      });

      // FECHA A ARTE E DEIXA O PAINEL COM O GANHADOR NA TELA (nao reseta nada).
      ov.querySelector('#rtFechar').addEventListener('click', function () {
        var fn = window.MarcaRoleta && window.MarcaRoleta.aoBaixar;
        if (typeof fn === 'function') { try { fn(vencedores); } catch (e) {} }
        ov.classList.remove('rt-on');
        setTimeout(function () { ov.remove(); }, 320);
        if (typeof opcoes.aoFechar === 'function') opcoes.aoFechar(vencedores);
      });
    }

    elGirar.addEventListener('click', function () {
      if (girando) return;
      girando = true;
      elGirar.disabled = true;
      elGirar.textContent = 'CORRENDO...';
      elFaixa.textContent = 'SORTEANDO';
      corre(true, proximo);
    });

    window.MarcaRoleta.fechar = function () { ov.remove(); };
    window.MarcaRoleta.vencedores = function () { return vencedores; };
    window.MarcaRoleta.total = function () { return TOTAL; };
    return vencedores;
  }

  window.MarcaRoleta = window.MarcaRoleta || {};
  window.MarcaRoleta.abrir = abrir;
})();
