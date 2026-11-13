/* Auto 2027 — dashboard dello staff */
(() => {
  const M = window.Modello;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const eur = (n, segno = false) => n == null || isNaN(n) ? '—' :
    (segno && n > 0 ? '+' : '') + new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
  const num = (n, d = 0) => n == null || isNaN(n) ? '—' : new Intl.NumberFormat('it-IT', { maximumFractionDigits: d }).format(n);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const giorni = (d) => Math.ceil((new Date(d + 'T00:00:00') - new Date(new Date().toDateString())) / 864e5);
  const dataIt = (d, opz = { day: 'numeric', month: 'short', year: 'numeric' }) => d ? new Date(d.length === 7 ? d + '-01' : d).toLocaleDateString('it-IT', opz) : '';
  const STATI = { in_vendita: 'In vendita', in_arrivo: 'In arrivo', monitorare: 'Da monitorare', scartata: 'Scartata' };
  const PALETTE = ['--zolfo', '--acciaio', '--salvia', '--cardinale', '--muto'];

  let D, P, classifica, grafici = {}, confrontoSel = [], autoConti = null;
  const stato = { filtro: 'idonee', tab: 'verdetto' };

  // ---------- tema ----------
  const salvaTema = (t) => { try { localStorage.setItem('tema', t); } catch (e) { } };
  try { const t = localStorage.getItem('tema'); if (t) document.documentElement.dataset.theme = t; } catch (e) { }
  $('#themeBtn').addEventListener('click', () => {
    const scuro = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    const nuovo = scuro ? 'light' : 'dark';
    document.documentElement.dataset.theme = nuovo; salvaTema(nuovo); disegnaTutto();
  });

  // ---------- navigazione ----------
  function apriTab(t, push = true) {
    stato.tab = t;
    $$('.tabs button').forEach(b => b.toggleAttribute('aria-current', b.dataset.tab === t) || b.dataset.tab === t && b.setAttribute('aria-current', 'page'));
    $$('.tab').forEach(s => s.classList.toggle('is-active', s.id === 'tab-' + t));
    if (push) history.replaceState(null, '', '#' + t);
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => Object.values(grafici).forEach(g => g && g.resize()));
  }
  $$('.tabs button').forEach(b => b.addEventListener('click', () => apriTab(b.dataset.tab)));
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (D && $('#tab-' + h)) apriTab(h, false); });

  // ---------- dati ----------
  function avvia(d) {
    D = d; P = structuredClone(d.profilo);
    const l = $('#loading'); l && l.remove();
    const h = location.hash.slice(1);
    calcola(); disegnaTutto();
    if (h && $('#tab-' + h)) apriTab(h, false);
  }
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  let chiaveCifrata = null;
  async function decifra(enc, pw) {
    const ch = chiaveCifrata || (chiaveCifrata = await (await fetch('data/chiave.enc.json', { cache: 'no-cache' })).json());
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
    const kPw = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(ch.salt), iterations: ch.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const pkcs8 = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(ch.iv) }, kPw, b64(ch.dati));
    const priv = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
    const kRaw = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, priv, b64(enc.k));
    const k = await crypto.subtle.importKey('raw', kRaw, 'AES-GCM', false, ['decrypt']);
    const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(enc.iv) }, k, b64(enc.dati));
    return JSON.parse(new TextDecoder().decode(buf));
  }
  function chiediPassword(enc, errore) {
    $('#loading').innerHTML = `<form class="porta" id="porta">
        <h2>Auto 2027</h2>
        <p class="muto">Pagina privata. Inserisci la password: su questo dispositivo te la chiederò una volta sola.</p>
        <input type="password" id="pw" autocomplete="current-password" placeholder="Password" required autofocus>
        ${errore ? '<p class="neg-num piccolo">Password sbagliata, riprova.</p>' : ''}
        <button type="submit">Apri la dashboard</button></form>`;
    $('#porta').addEventListener('submit', async e => {
      e.preventDefault();
      const pw = $('#pw').value;
      try { const d = await decifra(enc, pw); try { localStorage.setItem('auto2027_pw', pw); } catch (x) { } avvia(d); }
      catch (x) { chiediPassword(enc, true); }
    });
  }
  (async () => {
    try {
      const r = await fetch('data/bundle.json', { cache: 'no-cache' });
      if (r.ok) return avvia(await r.json());
      const enc = await (await fetch('data/bundle.enc.json', { cache: 'no-cache' })).json();
      let pw = null; try { pw = localStorage.getItem('auto2027_pw'); } catch (x) { }
      if (pw) { try { return avvia(await decifra(enc, pw)); } catch (x) { } }
      chiediPassword(enc, false);
    } catch (e) { $('#loading').textContent = 'Non riesco a leggere i dati dello staff (' + e.message + ').'; }
  })();

  function calcola() {
    const opz = {};
    D.auto.forEach(a => opz[a.id] = { beneficioFiscale: beneficioFiscale(), prezzo: (P._prezzo || {})[a.id] });
    classifica = M.classifica(D.auto, P, opz);
  }
  const scenariFisco = () => (((D.contesto || {}).fisco_privato_vs_azienda || {}).scenari) || [];
  function beneficioFiscale() {
    const s = scenariFisco().find(x => x.id === (P._fisco || 'privato'));
    if (!s) return 0;
    return P._beneficio ?? Math.round((s.beneficio_10_anni[0] + s.beneficio_10_anni[1]) / 2);
  }
  function bloccoFisco() {
    const f = ((D.contesto || {}).fisco_privato_vs_azienda) || {}, sc = scenariFisco();
    if (!sc.length) return '';
    const min = Math.min(...sc.map(s => s.beneficio_10_anni[0]), 0), max = Math.max(...sc.map(s => s.beneficio_10_anni[1]), 0);
    const x = v => (v - min) / (max - min) * 100;
    const col = { nessuno: '--salvia', medio: '--zolfo', alto: '--cardinale' };
    return `<div class="blocco"><header><h2>Privato o azienda agricola</h2><span class="muto piccolo">Rivalutato ogni settimana dal fiscalista${f.regime_agriturismo ? ' · agriturismo in regime ' + esc(f.regime_agriturismo.split(' ')[0]) : ''}</span></header>
      <div class="pannello">
        <p style="max-width:70ch">${esc(f.conclusione || '')}</p>
        <div class="fisco" style="margin-top:18px">${sc.map(s => `
          <div class="fisco-riga">
            <div><b>${esc(s.nome)}</b><div class="muto piccolo">rischio ${esc(s.rischio)}</div></div>
            <div class="fisco-asse"><i class="zero" style="left:${x(0)}%"></i><span style="left:${x(s.beneficio_10_anni[0])}%;width:${Math.max(1.2, x(s.beneficio_10_anni[1]) - x(s.beneficio_10_anni[0]))}%;background:var(${col[s.rischio] || '--muto'})"></span></div>
            <div class="fisco-val ${s.beneficio_10_anni[1] > 0 ? 'pos-num' : s.beneficio_10_anni[0] < 0 ? 'neg-num' : ''}">${s.beneficio_10_anni[0] === s.beneficio_10_anni[1] ? eur(s.beneficio_10_anni[0]) : eur(s.beneficio_10_anni[0], true) + ' / ' + eur(s.beneficio_10_anni[1], true)}</div>
            <details class="fisco-det"><summary>Come funziona</summary><p class="piccolo">${esc(s.come_funziona)}</p><p class="piccolo"><b>Requisiti:</b> ${esc(s.requisiti)}</p><p class="piccolo"><b>Giudizio:</b> ${esc(s.giudizio)}</p></details>
          </div>`).join('')}</div>
        <p class="muto piccolo" style="margin-top:12px">Beneficio netto in 10 anni rispetto a comprare da privato, su un'auto da circa 45.000 €. Stime: da confermare col commercialista.</p>
      </div></div>`;
  }
  const riga = (id) => classifica.righe.find(r => r.a.id === id);
  const idonee = () => classifica.righe.filter(r => r.idonea);

  function disegnaTutto() {
    Object.values(grafici).forEach(g => g && g.destroy()); grafici = {};
    vVerdetto(); vCandidate(); vConfronto(); vConti(); vNovita(); vStaff();
    $('#foot').innerHTML = `Aggiornato da Claude e dallo staff il ${dataIt(D.generato_il.slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' })}. Prossimo aggiornamento: domenica. Dati di fonte e stime sono distinti in ogni scheda; i prezzi vanno sempre confermati in concessionaria. Foto: Wikimedia Commons, autori indicati nelle schede.`;
  }

  // ---------- componenti ----------
  const silhouette = (a) => `<div class="segnaposto"><svg viewBox="0 0 200 80" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 58h176M30 58c0-10 8-18 18-18s18 8 18 18M134 58c0-10 8-18 18-18s18 8 18 18M22 50l14-16c6-6 12-10 24-12l34-4c16 0 30 6 42 14l26 6c10 2 16 6 18 12"/></svg></div>`;
  const foto = (a) => a.immagine && a.immagine.url
    ? `<img src="${esc(a.immagine.url)}" alt="${esc(a.marca + ' ' + a.modello)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createRange().createContextualFragment(window.__sil))">`
    : silhouette(a);
  window.__sil = silhouette();
  const chim = (a) => (a.batteria && a.batteria.chimica) || '?';
  const chipsAuto = (a) => {
    const c = [];
    const lfp = /LFP|LMFP/i.test(chim(a));
    c.push(`<span class="chip ${lfp ? 'si' : 'no'}">${esc(chim(a))}</span>`);
    const d = a.dotazioni || {};
    if (d.tetto_tendina) c.push('<span class="chip si">Tendina tetto</span>');
    if (d.carplay) c.push('<span class="chip">CarPlay</span>');
    const as = a.assistenza_sicilia;
    if (as && as.voto != null) c.push(`<span class="chip ${as.voto >= 7 ? 'si' : as.voto <= 4 ? 'no' : ''}">Assistenza ${as.voto >= 7 ? 'vicina' : as.voto <= 4 ? 'lontana' : 'media'}</span>`);
    return c.join('');
  };
  const realeKm = (a) => { const r = a.autonomia_reale_km || {}; return r.misto_mite || r.inverno || (a.wltp_km ? Math.round(a.wltp_km * 0.85) : null); };
  const votoTondo = (p) => `<div class="voto-tondo" style="--p:${p ?? 0}" title="Punteggio staff su 100"><span>${p ?? '—'}</span></div>`;

  function nota(a) {
    const r = riga(a.id);
    if (!r) return '';
    const d = r.c.finale;
    return `<span class="${d >= 0 ? 'pos-num' : 'neg-num'}">${d >= 0 ? 'Guadagni ' + eur(d) : 'Perdi ' + eur(-d)}</span> <span class="muto">in ${P.orizzonte_anni} anni rispetto a tenere la CX-5</span>`;
  }

  // ---------- VERDETTO ----------
  function vVerdetto() {
    const v = D.verdetto || {};
    const gg = giorni(P.data_decisione);
    const top = idonee().slice(0, 3);
    const inizio = new Date('2026-11-12'), fine = new Date(P.data_scadenza_maxirata), oggi = new Date();
    const pos = (d) => Math.max(0, Math.min(100, (new Date(d) - inizio) / (fine - inizio) * 100));
    const tappe = [
      { d: '2026-12-31', t: 'Fine anno<br>promo Q4', sotto: true },
      { d: '2027-02-15', t: 'Dati inverno<br>reali', sotto: false },
      { d: P.data_decisione, t: 'Raccomandata<br>CX-5', sotto: true },
      { d: '2027-03-31', t: 'Promo<br>fine Q1', sotto: false },
      { d: P.data_scadenza_maxirata, t: 'Scade la<br>maxirata', sotto: true }
    ];
    const uscita = M.uscitaCX5(P);
    $('#tab-verdetto').innerHTML = `
      <div class="hero">
        <div>
          <div class="conta"><b>${gg}</b><span>giorni alla raccomandata per la CX-5</span></div>
          <p class="verdetto">${esc(v.titolo || (top[0] ? `Conviene cambiare: in testa ${top[0].a.marca} ${top[0].a.modello}.` : 'Lo staff sta raccogliendo i dati.'))}</p>
          <p class="settimana">${esc(v.sintesi || '')}</p>
        </div>
        <div class="pannello">
          <h3>Tenere la CX-5 o cambiarla?</h3>
          <p class="muto piccolo" style="margin:6px 0 12px">Quanto ti è costata e ti costerà l'auto dal marzo 2024: soldi usciti (anticipo, rate, benzina o energia, manutenzione, assicurazione, bollo) meno quanto prenderesti vendendola oggi. La linea tratteggiata è la CX-5 tenuta fino al 2037; le altre partono a maggio 2027. Più in basso è la linea, meno spendi.</p>
          <div class="grafico" style="height:240px"><canvas id="gVerdetto"></canvas></div>
          <div class="sintesi-costi">
            <div><span>Tengo la CX-5</span><b>${eur(classifica.base.netto[P.orizzonte_anni] + storiaCX5().giaSpeso)}</b><small>totale dal 2024 al ${2027 + P.orizzonte_anni}</small></div>
            ${top.map(r => `<div><span>${esc(r.a.marca)} ${esc(r.a.modello)}</span><b>${eur(r.s.netto[P.orizzonte_anni] + storiaCX5().giaSpeso)}</b><small class="${r.c.finale >= 0 ? 'pos-num' : 'neg-num'}">${r.c.finale >= 0 ? eur(r.c.finale) + ' in meno' : eur(-r.c.finale) + ' in più'}${r.c.pareggio != null ? ' · conviene dal ' + (2027 + r.c.pareggio) : ''}</small></div>`).join('')}
          </div>
        </div>
      </div>
      <div class="strada" aria-label="Linea del tempo fino alla scadenza">
        ${tappe.map(t => `<div class="tappa ${t.sotto ? 'sotto' : ''} ${pos(t.d) > 92 ? 'destra' : ''}" style="left:${pos(t.d)}%">${t.sotto ? '<i></i>' + t.t : t.t + '<i></i>'}</div>`).join('')}
        <div class="tappa oggi ${pos(oggi) < 6 ? 'sinistra' : ''}" style="left:${pos(oggi)}%"><b>Oggi</b><i></i></div>
        <div class="asfalto"><div class="fatto" style="width:${pos(oggi)}%"></div></div>
        <div class="strada-leg"><span>12 nov 2026 · inizio lavori</span><span>Uscita dalla CX-5 più conveniente oggi: <b>${esc(uscita.modo)}</b> (${eur(uscita.costo)})</span></div>
      </div>

      <div class="blocco">
        <header><h2>Il podio di questa settimana</h2><span class="muto piccolo">Solo auto in vendita o in arrivo entro marzo, sotto ${eur(P.tetto_prezzo)}</span></header>
        <div class="podio">${top.map((r, i) => `
          <button class="pos ${i === 0 ? 'primo' : ''}" data-auto="${r.a.id}">
            <div class="foto">${foto(r.a)}<span class="rango">${i + 1}º</span></div>
            <div class="corpo">
              <div style="display:flex;justify-content:space-between;gap:10px;align-items:start">
                <div><h3>${esc(r.a.marca)} ${esc(r.a.modello)}</h3><div class="muto piccolo">${esc(r.a.versione || '')} · ${eur(r.s.prezzo)} stimati a marzo</div></div>
                ${votoTondo(r.punteggio)}
              </div>
              <div class="chips">${chipsAuto(r.a)}</div>
              <p class="piccolo delta">${nota(r.a)}</p>
            </div>
          </button>`).join('') || '<p class="muto">Nessuna candidata idonea per ora.</p>'}
        </div>
      </div>

      ${bloccoMensile(top)}

      ${bloccoFisco()}

      ${v.cambiamenti && v.cambiamenti.length ? `<div class="blocco"><header><h2>Cosa è cambiato questa settimana</h2></header>
        <div class="pannello"><ul style="margin:0;padding-left:20px;display:grid;gap:6px">${v.cambiamenti.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div></div>` : ''}

      <div class="blocco griglia-2">
        <div class="pannello">
          <h3>Le voci dello staff</h3>
          <div class="note-staff" style="margin-top:14px">${(v.note_staff || []).map(n => {
            const ag = (D.staff || []).find(s => s.id === n.agente) || { sigla: '?', colore: '--muto', nome: n.agente };
            return `<div class="nota"><div class="avatar" style="background:var(${ag.colore})">${esc(ag.sigla)}</div><div><b>${esc(ag.nome)}</b><p class="piccolo">${esc(n.testo)}</p></div></div>`;
          }).join('') || '<p class="muto">Nessuna nota.</p>'}</div>
        </div>
        <div class="pannello">
          <h3>Da fare prima di decidere</h3>
          <ul style="margin:12px 0 0;padding-left:20px;display:grid;gap:6px">${(v.da_fare || []).map(c => `<li>${esc(c)}</li>`).join('')}</ul>
          ${D.storico && D.storico.length > 1 ? '<h3 style="margin-top:20px">Andamento della classifica</h3><div class="grafico" style="height:220px"><canvas id="gStorico"></canvas></div>' : ''}
        </div>
      </div>`;
    $$('#tab-verdetto [data-auto]').forEach(b => b.addEventListener('click', () => apriScheda(b.dataset.auto)));
    graficoDelta('gVerdetto', top.map(r => r.a.id));
    if (D.storico && D.storico.length > 1) graficoStorico();
  }

  function stileGrafico() {
    return { grid: css('--linea'), text: css('--muto'), ink: css('--ink') };
  }
  // Storia della CX-5 da marzo 2024 a maggio 2027 (uguale per tutti gli scenari).
  // Posizione netta = soldi usciti − (valore dell'auto − debito residuo del finanziamento).
  function storiaCX5() {
    const c = P.cx5, h = c.storia || {};
    const anticipo = h.anticipo || 0, rata = h.rata || 0, prestito = h.prestito || c.maxirata, prezzoNuova = h.prezzo_nuova || c.valore_privato_maggio_2027;
    const meseCosti = (P.km_anno * c.consumo_l_100km / 100 * (h.prezzo_benzina_medio || c.prezzo_benzina) + c.manutenzione_anno + c.assicurazione_anno + c.bollo_anno) / 12;
    // punti: [etichetta, mesi da mar 2024, rate pagate, valore auto]
    const q = c.quotazioni_quattroruote || [];
    const val = (mesi) => { // interpola tra nuova (0), quotazioni e valore a maggio 2027 (38)
      const pts = [[0, prezzoNuova * 0.9], ...q.map(x => [(new Date(x.data) - new Date('2024-03-01')) / 2.63e9, x.privato]), [38, c.valore_privato_maggio_2027]];
      for (let i = 1; i < pts.length; i++) if (mesi <= pts[i][0]) { const [a, va] = pts[i - 1], [b, vb] = pts[i]; return va + (vb - va) * (mesi - a) / (b - a); }
      return c.valore_privato_maggio_2027;
    };
    const debito = (rate) => prestito + (c.maxirata - prestito) * rate / 36;
    const punto = (mesi, rate) => anticipo + rate * rata + mesi * meseCosti - (val(mesi) - debito(rate));
    return {
      etichette: ['mar 2024', 'dic 2024', 'dic 2025', 'dic 2026'],
      valori: [punto(0, 0), punto(9, 8), punto(21, 20), punto(33, 32)].map(Math.round),
      giaSpeso: anticipo + 36 * rata + 38 * meseCosti // soldi usciti fino ad aprile 2027
    };
  }
  function graficoDelta(id, ids) {
    const el = document.getElementById(id); if (!el || !window.Chart) return;
    const st = stileGrafico(), h = storiaCX5();
    const anni = Array.from({ length: P.orizzonte_anni + 1 }, (_, i) => 'mag ' + (2027 + i));
    const labels = [...h.etichette, ...anni];
    const vuoto = h.etichette.map((_, i) => i === h.etichette.length - 1 ? h.valori[i] : null); // il bivio parte dalla CX-5
    const sposta = arr => arr.map(v => Math.round(v + h.giaSpeso));
    const ds = [{ label: 'Tengo la CX-5', data: [...h.valori, ...sposta(classifica.base.netto)], borderColor: st.ink, backgroundColor: st.ink, borderDash: [6, 5], borderWidth: 2.5, pointRadius: 0, tension: .2 }];
    ids.forEach((aid, i) => {
      const r = riga(aid); if (!r) return;
      const col = css(PALETTE[i % PALETTE.length]);
      ds.push({ label: r.a.marca + ' ' + r.a.modello, data: [...vuoto, ...sposta(r.s.netto)], borderColor: col, backgroundColor: col, borderWidth: i === 0 ? 3.5 : 2, pointRadius: 0, tension: .2 });
    });
    const baseIdx = (i) => ds[0].data[i];
    grafici[id] = new Chart(el, {
      type: 'line', data: { labels, datasets: ds },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: st.text, boxWidth: 12, font: { family: 'Archivo' } } },
          tooltip: { callbacks: { label: c => {
            const d = c.datasetIndex > 0 && baseIdx(c.dataIndex) != null ? baseIdx(c.dataIndex) - c.parsed.y : null;
            return `${c.dataset.label}: ${eur(c.parsed.y)}${d != null ? `  (${d >= 0 ? 'risparmi ' + eur(d) : 'spendi ' + eur(-d) + ' in più'})` : ''}`;
          } } } },
        scales: { x: { grid: { color: st.grid }, ticks: { color: st.text, maxRotation: 0, autoSkipPadding: 8 } }, y: { grid: { color: st.grid }, ticks: { color: st.text, callback: v => num(v / 1000) + 'k €' } } }
      }
    });
  }
  function graficoStorico() {
    const st = stileGrafico();
    const settimane = D.storico.map(s => dataIt(s.data, { day: 'numeric', month: 'short' }));
    const ids = [...new Set(D.storico.flatMap(s => (s.classifica || []).slice(0, 5).map(c => c.id)))].slice(0, 5);
    grafici.gStorico = new Chart($('#gStorico'), {
      type: 'line',
      data: { labels: settimane, datasets: ids.map((id, i) => ({ label: (D.auto.find(a => a.id === id) || { modello: id }).modello, data: D.storico.map(s => (s.classifica.find(c => c.id === id) || {}).punteggio ?? null), borderColor: css(PALETTE[i % 5]), pointRadius: 3, tension: .2 })) },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: st.text, boxWidth: 10 } } }, scales: { x: { grid: { color: st.grid }, ticks: { color: st.text } }, y: { grid: { color: st.grid }, ticks: { color: st.text } } } }
    });
  }

  // ---------- CANDIDATE ----------
  const FILTRI = {
    idonee: ['Le idonee', r => r.idonea],
    tutte: ['Tutte', () => true],
    lfp: ['Solo LFP', r => /LFP|LMFP/i.test(chim(r.a))],
    arrivo: ['In arrivo', r => r.a.stato === 'in_arrivo' || r.a.stato === 'monitorare'],
    scartate: ['Scartate', r => r.a.stato === 'scartata']
  };
  function vCandidate() {
    const f = FILTRI[stato.filtro][1];
    const lista = classifica.righe.filter(f);
    $('#tab-candidate').innerHTML = `
      <header style="margin-bottom:14px"><h2>Le candidate</h2><p class="muto" style="margin-top:6px">Ordinate per punteggio dello staff. Tocca un'auto per la scheda completa.</p></header>
      <div class="filtri" role="group" aria-label="Filtra">${Object.entries(FILTRI).map(([k, [t, fn]]) => `<button class="filtro" data-f="${k}" aria-pressed="${stato.filtro === k}">${t} <span class="muto">${classifica.righe.filter(fn).length}</span></button>`).join('')}</div>
      <div class="elenco">${lista.map(r => card(r)).join('') || '<p class="muto">Nessuna auto con questo filtro.</p>'}</div>`;
    $$('#tab-candidate .filtro').forEach(b => b.addEventListener('click', () => { stato.filtro = b.dataset.f; vCandidate(); }));
    $$('#tab-candidate [data-auto]').forEach(b => b.addEventListener('click', () => apriScheda(b.dataset.auto)));
  }
  function card(r) {
    const a = r.a, dim = a.dimensioni || {};
    return `<button class="card ${r.idonea ? '' : 'fuori'}" data-auto="${a.id}">
      <div class="foto">${foto(a)}<span class="stato chip ${a.stato === 'in_vendita' ? 'zolfo' : ''}">${STATI[a.stato] || a.stato}</span></div>
      <div class="corpo">
        <div class="titolo"><div><h3>${esc(a.marca)} ${esc(a.modello)}</h3><div class="versione">${esc(a.versione || '')}</div></div>${votoTondo(r.punteggio)}</div>
        <div class="chips">${chipsAuto(a)}</div>
        <p class="piccolo">${nota(a)}</p>
        <div class="dati">
          <div><b>${eur(r.s.prezzo)}</b><small>prezzo stimato</small></div>
          <div><b>${num(realeKm(a))} km</b><small>autonomia reale</small></div>
          <div><b>${num(a.batteria && a.batteria.kwh_netti, 1)} kWh</b><small>batteria</small></div>
          <div><b>${num(dim.bagagliaio_l)}${dim.frunk_l ? '+' + num(dim.frunk_l) : ''} L</b><small>bagagliaio</small></div>
        </div>
        ${a.motivo_scarto ? `<p class="piccolo neg-num">${esc(a.motivo_scarto)}</p>` : (!r.idonea && r.esclusioni.length ? `<p class="piccolo neg-num">Fuori dal podio: ${esc(r.esclusioni.join(', '))}</p>` : '')}
        ${r.avvisi && r.avvisi.length ? `<p class="piccolo avviso">${esc(r.avvisi.join('; '))}</p>` : ''}
      </div></button>`;
  }

  // ---------- SCHEDA ----------
  function apriScheda(id) {
    const r = riga(id); if (!r) return;
    const a = r.a, d = a.dimensioni || {}, b = a.batteria || {}, ri = a.ricarica || {}, pr = a.prestazioni || {}, g = a.garanzia || {}, ar = a.autonomia_reale_km || {};
    const spec = [
      ['Prezzo di listino', eur(a.prezzo_listino)], ['Prezzo stimato marzo 2027', Array.isArray(a.prezzo_stimato_marzo_2027) ? a.prezzo_stimato_marzo_2027.map(x => eur(x)).join(' – ') : eur(r.s.prezzo)],
      ['Batteria', `${esc(b.chimica || '?')} ${num(b.kwh_netti, 1)} kWh · ${num(b.architettura_v)} V`], ['Autonomia WLTP', num(a.wltp_km) + ' km'],
      ['Reale, clima mite', num(ar.misto_mite) + ' km'], ['Reale, inverno', num(ar.inverno) + ' km'], ['Autostrada 130 km/h', num(ar.autostrada_130) + ' km'],
      ['Consumo reale', num(M.consumo(a), 1) + ' kWh/100 km'], ['Ricarica rapida', `${num(ri.dc_kw)} kW · 10-80% ${num(ri.dc_10_80_min)} min`], ['Ricarica a casa', num(ri.ac_kw, 1) + ' kW'],
      ['Lunghezza', d.lunghezza_mm ? num(d.lunghezza_mm / 1000, 2) + ' m' : '—'], ['Passo', d.passo_mm ? num(d.passo_mm / 1000, 2) + ' m' : '—'], ['Bagagliaio', `${num(d.bagagliaio_l)} L${d.frunk_l ? ' + ' + num(d.frunk_l) + ' L davanti' : ''}`],
      ['Peso', num(d.peso_kg) + ' kg'], ['Potenza', `${num(pr.potenza_cv)} CV · ${esc(pr.trazione || '')}`], ['0-100 km/h', num(pr.zero_cento_s, 1) + ' s'],
      ['Garanzia auto', esc(g.auto || '—')], ['Garanzia batteria', esc(g.batteria || '—')], ['Euro NCAP', esc(a.euro_ncap || '—')], ['Prodotta a', esc(a.produzione || '—')]
    ];
    const vn = a.voti_note || {}, voti = Object.assign({}, a.voti, { economia: r.votoEconomia });
    const s = r.s, eco = r.c;
    $('#scheda').innerHTML = `
      <button class="chiudi" aria-label="Chiudi">×</button>
      <div class="testa">${foto(a)}</div>
      <div class="dentro">
        <div style="display:flex;justify-content:space-between;gap:16px;align-items:start;flex-wrap:wrap">
          <div><h2 id="schedaTitolo">${esc(a.marca)} ${esc(a.modello)}</h2><p class="muto">${esc(a.versione || '')} · ${STATI[a.stato] || ''} ${a.disponibile_italia ? '· ' + esc(a.disponibile_italia) : ''}</p>
          <div class="chips" style="margin-top:10px">${chipsAuto(a)}</div></div>
          ${votoTondo(r.punteggio)}
        </div>
        ${a.motivo_scarto ? `<p class="neg-num"><b>Perché è fuori:</b> ${esc(a.motivo_scarto)}</p>` : (!r.idonea && r.esclusioni.length ? `<p class="neg-num"><b>Fuori dal podio:</b> ${esc(r.esclusioni.join(', '))}</p>` : '')}
        ${r.avvisi && r.avvisi.length ? `<p class="avviso"><b>Attenzione:</b> ${esc(r.avvisi.join('; '))}</p>` : ''}
        <div class="risultato" style="margin:0">
          <div><small>Rispetto a tenere la CX-5, in ${P.orizzonte_anni} anni</small><b class="${eco.finale >= 0 ? 'pos-num' : 'neg-num'}">${eur(eco.finale, true)}</b></div>
          <div><small>Vai in guadagno dal</small><b>${eco.pareggio != null ? (2027 + eco.pareggio) : 'mai'}</b></div>
          <div><small>Rata (anticipo ${eur(s.anticipo)}, ${P.finanziamento.mesi} mesi)</small><b>${eur(s.rata)}/mese</b></div>
        </div>
        ${(() => {
          const fu = M.autonomiaFutura(a, P.orizzonte_anni), viaggio = 300;
          const ok = fu.inverno && fu.inverno >= viaggio * 1.1;
          return `<div class="pannello" style="box-shadow:none;background:var(--carta-2)">
            <h3>Tra ${P.orizzonte_anni} anni (circa ${num(P.km_anno * P.orizzonte_anni)} km)</h3>
            <div class="specs" style="margin-top:10px">
              <div><small>Batteria residua stimata</small><b>~${Math.round(fu.salute * 100)}%</b></div>
              <div><small>Autonomia reale, clima mite</small><b>~${num(fu.mite)} km</b></div>
              <div><small>Autonomia reale, inverno</small><b>~${num(fu.inverno)} km</b></div>
              <div><small>Garanzia batteria</small><b>${esc((a.garanzia || {}).batteria || '—')}</b></div>
            </div>
            <p class="piccolo ${ok ? 'pos-num' : 'neg-num'}" style="margin-top:8px">${ok ? `Anche nel ${2027 + P.orizzonte_anni}, d'inverno, il tuo viaggio tipo da ${viaggio} km andata e ritorno si fa senza ricaricare.` : `Nel ${2027 + P.orizzonte_anni}, d'inverno, per il viaggio da ${viaggio} km andata e ritorno potrebbe servire una breve sosta di ricarica.`}</p>
            <p class="muto piccolo" style="margin-top:4px">Stima: ${/LFP|LMFP/i.test(chim(a)) ? 'batteria LFP, perde circa l\'1,2% l\'anno e si può caricare al 100% senza danni' : 'batteria NMC, perde circa l\'1,7% l\'anno se caricata di solito all\'80%'}.</p>
          </div>`;
        })()}
        <div><h3>Caratteristiche principali</h3><div class="specs" style="margin-top:10px">${spec.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('')}</div></div>
        ${(a.varianti_batteria || []).length > 1 ? `<div><h3>Versioni di batteria in Italia</h3><div class="chips" style="margin-top:10px">${a.varianti_batteria.map(v => {
          const testo = `${num(v.kwh, 1)} kWh ${esc(v.chimica || '')}${v.prezzo_listino ? ' · ' + eur(v.prezzo_listino) : ''}`;
          return v.id_scheda && v.id_scheda !== a.id && riga(v.id_scheda) ? `<button class="filtro" data-variante="${esc(v.id_scheda)}">${testo}</button>` : `<span class="chip ${v.id_scheda === a.id ? 'zolfo' : ''}">${testo}</span>`;
        }).join('')}</div></div>` : ''}
        <div><h3>I voti dello staff</h3><div class="barre" style="margin-top:12px">${Object.keys(M.CRITERI).map(k => voti[k] == null ? '' : `
          <div class="barra ${k}"><span>${M.CRITERI[k]}</span><div class="t"><i style="width:${voti[k] * 10}%"></i></div><b>${num(voti[k], 1)}</b>${vn[k] ? `<small>${esc(vn[k])}</small>` : ''}</div>`).join('')}</div></div>
        <div class="procontro">
          <div><h3 class="pos-num">A favore</h3><ul>${(a.pro || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
          <div><h3 class="neg-num">Contro</h3><ul>${(a.contro || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
        </div>
        ${a.assistenza_sicilia ? `<div><h3>Assistenza vicino a casa</h3><p style="margin-top:6px">${esc(a.assistenza_sicilia.dettaglio || '')}</p></div>` : ''}
        ${a.promo_attuali ? `<div><h3>Promozioni</h3><p style="margin-top:6px">${esc(a.promo_attuali)}</p></div>` : ''}
        ${a.note_staff ? `<div><h3>Nota dello staff</h3><p style="margin-top:6px">${esc(a.note_staff)}</p></div>` : ''}
        <div class="fonti">
          ${a.link_ufficiale ? `<p><a href="${esc(a.link_ufficiale)}" target="_blank" rel="noopener">Sito ufficiale e configuratore</a></p>` : ''}
          ${(a.fonti || []).length ? `<p style="margin-top:6px"><b>Fonti</b></p><ul style="margin:4px 0 0;padding-left:18px">${a.fonti.map(f => `<li><a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.titolo || f.url)}</a> ${f.data ? '(' + esc(f.data) + ')' : ''}</li>`).join('')}</ul>` : ''}
          ${a.immagine && a.immagine.url ? `<p style="margin-top:6px">Foto: ${esc(a.immagine.autore || '')}, ${esc(a.immagine.licenza || '')} — <a href="${esc(a.immagine.pagina || a.immagine.url)}" target="_blank" rel="noopener">Wikimedia Commons</a></p>` : ''}
          <p style="margin-top:6px">Scheda aggiornata il ${esc(a.aggiornato_il || '')}.</p>
        </div>
      </div>`;
    const dlg = $('#scheda');
    $('.chiudi', dlg).addEventListener('click', () => dlg.close());
    $$('[data-variante]', dlg).forEach(b => b.addEventListener('click', () => { dlg.close(); apriScheda(b.dataset.variante); }));
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); }, { once: true });
    dlg.showModal(); dlg.scrollTop = 0;
  }

  // ---------- CONFRONTO ----------
  function vConfronto() {
    if (!confrontoSel.length) confrontoSel = idonee().slice(0, 3).map(r => r.a.id);
    const sel = confrontoSel.map(riga).filter(Boolean);
    const righeT = [
      ['Punteggio staff', r => r.punteggio, 'max'],
      [`Guadagno vs CX-5 in ${P.orizzonte_anni} anni`, r => r.c.finale, 'max', eur],
      ['Anno di pareggio', r => r.c.pareggio != null ? 2027 + r.c.pareggio : null, 'min', x => x ?? 'mai'],
      ['Prezzo stimato', r => r.s.prezzo, 'min', eur],
      ['Rata mensile', r => r.s.rata, 'min', x => eur(x) + '/mese'],
      ['Chimica batteria', r => chim(r.a), null],
      ['Batteria (kWh)', r => r.a.batteria && r.a.batteria.kwh_netti, 'max', x => num(x, 1)],
      ['Autonomia reale mite', r => (r.a.autonomia_reale_km || {}).misto_mite, 'max', x => num(x) + ' km'],
      ['Autonomia reale inverno', r => (r.a.autonomia_reale_km || {}).inverno, 'max', x => num(x) + ' km'],
      ['Autostrada 130 km/h', r => (r.a.autonomia_reale_km || {}).autostrada_130, 'max', x => num(x) + ' km'],
      ['Batteria tra 10 anni', r => Math.round(M.salute(r.a, P.orizzonte_anni) * 100), 'max', x => '~' + x + '%'],
      ['Autonomia inverno tra 10 anni', r => M.autonomiaFutura(r.a, P.orizzonte_anni).inverno, 'max', x => '~' + num(x) + ' km'],
      ['Consumo reale', r => M.consumo(r.a), 'min', x => num(x, 1) + ' kWh/100'],
      ['Ricarica 10-80%', r => (r.a.ricarica || {}).dc_10_80_min, 'min', x => num(x) + ' min'],
      ['Bagagliaio', r => (r.a.dimensioni || {}).bagagliaio_l, 'max', x => num(x) + ' L'],
      ['Lunghezza', r => (r.a.dimensioni || {}).lunghezza_mm, null, x => x ? num(x / 1000, 2) + ' m' : '—'],
      ['Peso', r => (r.a.dimensioni || {}).peso_kg, 'min', x => num(x) + ' kg'],
      ['Garanzia batteria', r => (r.a.garanzia || {}).batteria, null],
      ...Object.keys(M.CRITERI).filter(k => k !== 'economia').map(k => [M.CRITERI[k], r => (r.a.voti || {})[k], 'max', x => num(x, 1)])
    ];
    $('#tab-confronto').innerHTML = `
      <header style="margin-bottom:14px"><h2>Confronto diretto</h2><p class="muto" style="margin-top:6px">Scegli fino a 4 auto. In verde il valore migliore di ogni riga.</p></header>
      <div class="selettori">${classifica.righe.filter(r => r.a.stato !== 'scartata').map(r => `<button class="filtro" data-id="${r.a.id}" aria-pressed="${confrontoSel.includes(r.a.id)}">${esc(r.a.marca)} ${esc(r.a.modello)}</button>`).join('')}</div>
      <div class="tabella-wrap"><table>
        <thead><tr><th></th>${sel.map(r => `<th>${esc(r.a.marca)} ${esc(r.a.modello)}<div class="muto piccolo">${esc(r.a.versione || '')}</div></th>`).join('')}</tr></thead>
        <tbody>${righeT.map(([nome, fn, best, fmt]) => {
          const vals = sel.map(fn);
          const nums = vals.filter(v => typeof v === 'number');
          const top = best === 'max' ? Math.max(...nums) : best === 'min' ? Math.min(...nums) : null;
          return `<tr><th>${nome}</th>${vals.map(v => `<td class="${best && nums.length > 1 && v === top ? 'meglio' : ''}">${esc(fmt ? fmt(v) : (v ?? '—'))}</td>`).join('')}</tr>`;
        }).join('')}</tbody></table></div>
      <div class="pannello blocco"><h3>Quanto spendi in totale dal 2024, anno per anno</h3><p class="muto piccolo" style="margin-top:4px">Più in basso è la linea, meno spendi. Tocca il grafico per vedere la differenza con la CX-5.</p><div class="grafico" style="margin-top:12px"><canvas id="gConfronto"></canvas></div></div>`;
    $$('#tab-confronto .selettori button').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.id;
      confrontoSel = confrontoSel.includes(id) ? confrontoSel.filter(x => x !== id) : [...confrontoSel, id].slice(-4);
      grafici.gConfronto && grafici.gConfronto.destroy(); vConfronto();
    }));
    graficoDelta('gConfronto', confrontoSel);
  }

  // ---------- CONTI ----------
  function vConti() {
    const lista = classifica.righe.filter(r => r.a.stato !== 'scartata');
    if (!autoConti || !riga(autoConti)) autoConti = (idonee()[0] || lista[0] || {}).a?.id;
    const r = riga(autoConti); if (!r) { $('#tab-conti').innerHTML = '<p class="muto">Nessuna auto.</p>'; return; }
    const f = P.finanziamento, mix = P.ricarica_mix, fisc = (D.contesto || {}).fisco_privato_vs_azienda || {};
    const slider = (id, label, val, min, max, step, fmt, help = '') => `<div class="campo"><label for="${id}">${label}<output id="${id}-o">${fmt(val)}</output></label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}">${help ? `<small>${help}</small>` : ''}</div>`;
    const s = r.s, c = r.c, base = classifica.base;
    const mediaMese = (s.netto[P.orizzonte_anni]) / (P.orizzonte_anni * 12);
    $('#tab-conti').innerHTML = `
      <header style="margin-bottom:14px"><h2>I conti, a modo tuo</h2><p class="muto" style="margin-top:6px">Muovi i cursori: classifica, podio e grafici si aggiornano ovunque. Tutto è calcolato come se pagassi tu.</p></header>
      <div class="calc">
        <div class="pannello comandi">
          <div class="campo"><label for="cAuto">Auto da analizzare</label><select id="cAuto">${lista.map(x => `<option value="${x.a.id}" ${x.a.id === autoConti ? 'selected' : ''}>${esc(x.a.marca)} ${esc(x.a.modello)} ${esc(x.a.versione || '')}</option>`).join('')}</select></div>
          ${slider('cPrezzo', 'Prezzo che riesci a spuntare', s.prezzo, Math.round(s.prezzo * 0.8 / 100) * 100, Math.round(s.prezzo * 1.15 / 100) * 100, 100, eur)}
          ${slider('cKm', 'Km all\'anno', P.km_anno, 8000, 40000, 500, v => num(v) + ' km')}
          ${slider('cAnni', 'Per quanti anni la tieni', P.orizzonte_anni, 4, 12, 1, v => v + ' anni')}
          ${slider('cBenz', 'Prezzo benzina', P.cx5.prezzo_benzina, 1.4, 2.4, 0.01, v => num(v, 2) + ' €/l')}
          ${slider('cAnt', 'Anticipo', f.anticipo, 0, P.finanziamento.liquidita + 10000, 500, eur)}
          ${slider('cTan', 'Tasso (TAN)', f.tan * 100, 0, 9, 0.1, v => num(v, 2) + '%')}
          ${slider('cMesi', 'Durata finanziamento', f.mesi, 24, 120, 12, v => v + ' mesi')}
          ${slider('cVal', 'Valore CX-5 a maggio 2027 (privato)', P.cx5.valore_privato_maggio_2027, 16000, 26000, 250, eur, (P.cx5.quotazioni_quattroruote || []).slice(-1).map(q => `Quattroruote: ${eur(q.privato)} a ${num(q.km)} km (${dataIt(q.data)})`).join(''))}
          <div class="campo"><label>Dove ricarichi</label><div class="mix">
            ${slider('mUff', 'In ufficio (gratis)', Math.round(mix.ufficio_gratis * 100), 0, 100, 5, v => v + '%')}
            ${slider('mFv', 'A casa col fotovoltaico', Math.round(mix.casa_fv * 100), 0, 100, 5, v => v + '%')}
            ${slider('mRete', 'A casa di notte (rete)', Math.round(mix.casa_rete * 100), 0, 100, 5, v => v + '%')}
            ${slider('mPub', 'Colonnine (viaggi)', Math.round(mix.pubblica * 100), 0, 100, 5, v => v + '%')}
          </div><small>Il totale viene riproporzionato a 100%. Costo medio: <b>${num(M.costoKwh(P), 3)} €/kWh</b></small></div>
          <div class="campo"><label for="cFisco">A chi la intesti</label><select id="cFisco">${scenariFisco().map(x => `<option value="${x.id}" ${x.id === (P._fisco || 'privato') ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select><small>${esc(fisc.sintesi_breve || '')}</small></div>
          ${(P._fisco || 'privato') !== 'privato' ? slider('cBen', 'Effetto fiscale netto in 10 anni', beneficioFiscale(), -20000, 15000, 250, x => eur(x, true), 'Parte dalla stima centrale del fiscalista; spostalo per provare altri valori.') : ''}
        </div>
        <div>
          <div class="risultato">
            <div><small>In ${P.orizzonte_anni} anni rispetto a tenere la CX-5</small><b class="${c.finale >= 0 ? 'pos-num' : 'neg-num'}">${eur(c.finale, true)}</b></div>
            <div><small>Vai in guadagno dal</small><b>${c.pareggio != null ? 2027 + c.pareggio : 'mai'}</b></div>
            <div><small>Costo medio netto al mese</small><b>${eur(mediaMese)}</b><small>CX-5: ${eur(base.netto[P.orizzonte_anni] / (P.orizzonte_anni * 12))}</small></div>
          </div>
          <div class="pannello"><h3>Quanto spendi in totale dal 2024, anno per anno</h3><p class="muto piccolo" style="margin-top:4px">Soldi usciti dal marzo 2024 meno quanto prenderesti vendendo l'auto (togliendo il debito residuo). Più in basso è la linea, meno spendi.</p><div class="grafico" style="margin-top:12px"><canvas id="gConti"></canvas></div></div>
          <div class="pannello blocco" style="margin-top:16px">
            <h3>Da dove vengono i numeri</h3>
            <div class="tabella-wrap" style="box-shadow:none;margin-top:10px"><table>
              <thead><tr><th>Voce</th><th>${esc(r.a.modello)}</th><th>Tengo la CX-5</th></tr></thead>
              <tbody>
                <tr><th>Uscita dalla CX-5</th><td>${eur(s.uscita.costo)} <span class="muto piccolo">(${esc(s.uscita.modo)})</span></td><td>${eur(P.cx5.maxirata)} maxirata</td></tr>
                <tr><th>Anticipo + finanziato</th><td>${eur(s.anticipo)} + ${eur(s.finanziato)}</td><td>—</td></tr>
                <tr><th>Interessi totali</th><td>${eur(s.interessi)}</td><td>—</td></tr>
                <tr><th>Energia / carburante all'anno</th><td>${eur(s.spese[0].energia)} <span class="muto piccolo">(${num(s.consumo, 1)} kWh/100 a ${num(s.energiaKwh, 3)} €)</span></td><td>${eur(base.spese[0].carburante)}</td></tr>
                <tr><th>Manutenzione + gomme all'anno</th><td>${eur(s.spese[0].manut + s.spese[0].gomme)}</td><td>${eur(base.spese[0].manut)} <span class="muto piccolo">poi cresce</span></td></tr>
                <tr><th>Assicurazione + bollo all'anno</th><td>${eur(s.spese[0].assic)} + bollo esente ${P.ev.bollo_esente_anni} anni</td><td>${eur(base.spese[0].assic + base.spese[0].bollo)}</td></tr>
                <tr><th>Valore dopo ${P.orizzonte_anni} anni</th><td>${eur(s.valoreFinale)}</td><td>${eur(base.valoreFinale)}</td></tr>
              </tbody></table></div>
          </div>
          ${pannelloStrategia(r)}
          ${pannelloTassi()}
          ${energiaPannello(s)}
          <div class="pannello blocco" style="margin-top:16px">
            <h3>Quanto pesa ogni criterio nella classifica</h3>
            <div class="mix" style="margin-top:10px">${Object.entries(P.pesi_punteggio).map(([k, v]) => slider('w_' + k, M.CRITERI[k], v, 0, 40, 1, x => x)).join('')}</div>
          </div>
        </div>
      </div>`;
    graficoConti(r);
    graficoEnergia();
    const on =(id, fn) => { const el = document.getElementById(id); el && el.addEventListener('input', () => { const o = document.getElementById(id + '-o'); fn(+el.value); ricalcola(id); }); };
    $('#cAuto').addEventListener('change', e => { autoConti = e.target.value; P._prezzo = {}; ricalcola(); });
    P._prezzo = P._prezzo || {};
    on('cPrezzo', v => { P._prezzo[autoConti] = v; });
    on('cKm', v => P.km_anno = v);
    on('cAnni', v => P.orizzonte_anni = v);
    on('cBenz', v => P.cx5.prezzo_benzina = v);
    on('cAnt', v => P.finanziamento.anticipo = v);
    on('cTan', v => P.finanziamento.tan = v / 100);
    on('cMesi', v => P.finanziamento.mesi = v);
    on('cVal', v => P.cx5.valore_privato_maggio_2027 = v);
    on('mUff', v => P.ricarica_mix.ufficio_gratis = v / 100);
    on('mFv', v => P.ricarica_mix.casa_fv = v / 100);
    on('mRete', v => P.ricarica_mix.casa_rete = v / 100);
    on('mPub', v => P.ricarica_mix.pubblica = v / 100);
    on('cBen', v => P._beneficio = v);
    Object.keys(P.pesi_punteggio).forEach(k => on('w_' + k, v => P.pesi_punteggio[k] = v));
    $('#cFisco').addEventListener('change', e => { P._fisco = e.target.value; delete P._beneficio; ricalcola(); });
  }
  let timer;
  function ricalcola(focusId) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const y = window.scrollY;
      calcola();
      disegnaTutto();
      window.scrollTo({ top: y });
      if (focusId) { const el = document.getElementById(focusId); el && el.focus({ preventScroll: true }); }
    }, 120);
  }
  function graficoConti(r) {
    return graficoDelta('gConti', [r.a.id]);
  }
  function graficoContiVecchio(r) {
    const st = stileGrafico();
    const anni = Array.from({ length: P.orizzonte_anni + 1 }, (_, i) => 2027 + i);
    grafici.gConti = new Chart($('#gConti'), {
      type: 'line',
      data: { labels: anni, datasets: [
        { label: r.a.marca + ' ' + r.a.modello, data: r.s.netto.map(Math.round), borderColor: css('--zolfo'), backgroundColor: css('--zolfo'), borderWidth: 3.5, pointRadius: 2, tension: .2 },
        { label: 'Tengo la CX-5', data: classifica.base.netto.map(Math.round), borderColor: st.ink, borderDash: [6, 5], borderWidth: 2, pointRadius: 0, tension: .2 }
      ] },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: st.text, boxWidth: 12 } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${eur(c.parsed.y)}` } } },
        scales: { x: { grid: { color: st.grid }, ticks: { color: st.text } }, y: { grid: { color: st.grid }, ticks: { color: st.text, callback: v => num(v / 1000) + 'k' } } } }
    });
  }

  function bloccoMensile(top) {
    const c = P.cx5, ev = P.ev;
    const benz = P.km_anno * c.consumo_l_100km / 100 * c.prezzo_benzina / 12;
    const gestCX = y => benz + (c.manutenzione_anno * Math.pow(1 + c.manutenzione_crescita_anno, y) + c.assicurazione_anno + c.bollo_anno) / 12;
    const rataOggi = (c.storia || {}).rata || 0;
    const contanti = Math.min(P.finanziamento.anticipo_massimo || P.finanziamento.anticipo, c.maxirata);
    const rataTieni = M.rata(c.maxirata - contanti, 0.0699, 36);
    const gestEV = a => (P.km_anno * M.consumo(a) * (1 + P.perdite_ricarica_ac) / 100 * M.costoKwh(P) + ev.manutenzione_anno + P.km_anno / ev.pneumatici_ogni_km * ev.costo_treno_gomme + ev.assicurazione_anno) / 12;
    const anniFin = Math.round(P.finanziamento.mesi / 12 * 10) / 10;
    const riga = (nome, durante, dettaglio, dopo, nota) => `<tr><th>${nome}</th><td><b>${eur(durante)}</b><div class="muto piccolo">${dettaglio}</div></td><td>${dopo != null ? eur(dopo) : '—'}</td><td class="piccolo">${nota || ''}</td></tr>`;
    return `<div class="blocco"><header><h2>Quanto spendi al mese</h2><span class="muto piccolo">Rata + benzina o energia + manutenzione e gomme + assicurazione + bollo</span></header>
      <div class="tabella-wrap"><table>
        <thead><tr><th></th><th>Durante il finanziamento</th><th>Dopo</th><th></th></tr></thead>
        <tbody>
          ${rataOggi ? riga('Oggi, con la CX-5', rataOggi + gestCX(0), `rata ${eur(rataOggi)} + benzina ${eur(benz)} + resto ${eur(gestCX(0) - benz)}`, null, 'fino ad aprile 2027') : ''}
          ${riga('Tieni la CX-5', rataTieni + gestCX(0), `rata ${eur(rataTieni)} per 3 anni (riscatto: ${eur(contanti)} in contanti + resto finanziato) + benzina ${eur(benz)} + resto`, gestCX(5), 'la manutenzione cresce con gli anni')}
          ${top.map(r => riga(`${esc(r.a.marca)} ${esc(r.a.modello)}`, r.s.rata + gestEV(r.a), `rata ${eur(r.s.rata)} per ${anniFin} anni + energia, manutenzione e assicurazione ${eur(gestEV(r.a))}`, gestEV(r.a), r.s.rata > (P.rata_massima || Infinity) * 1.02 ? `<span class="neg-num">rata sopra i tuoi ${eur(P.rata_massima)}</span>` : `<span class="pos-num">rata entro i tuoi ${eur(P.rata_massima)}</span>`)).join('')}
        </tbody></table></div>
      <p class="muto piccolo" style="margin-top:8px">La rata dell'elettrica è più alta di quella di oggi, ma la benzina (circa ${eur(benz)} al mese) quasi sparisce: la spesa totale al mese scende. Durata del finanziamento modificabile nella sezione Conti.</p></div>`;
  }
  function pannelloStrategia(r) {
    const f = P.finanziamento, max = f.anticipo_massimo || f.liquidita || 17000;
    const totale = r.s.prezzo + P.ev.spese_immatricolazione;
    const anticipi = [...new Set([Math.round(max * 0.6 / 500) * 500, Math.round(max * 0.8 / 500) * 500, max])];
    const durate = [48, 60, 72, 84, 96];
    const lim = P.rata_massima || Infinity;
    const calc = (ant, mesi) => {
      const cap = totale - ant + f.spese_istruttoria, rata = M.rata(cap, f.tan, mesi);
      return { rata, interessi: rata * mesi - cap + f.spese_istruttoria };
    };
    const rend = f.rendimento_alternativo_liquidita || 0;
    const consiglioAnticipo = f.tan > rend ? max : anticipi[0];
    const durataOk = durate.find(m => calc(consiglioAnticipo, m).rata <= lim);
    const prezzoMax = m => Math.round(lim * (1 - Math.pow(1 + f.tan / 12, -m)) / (f.tan / 12) + max - f.spese_istruttoria - P.ev.spese_immatricolazione);
    return `<div class="pannello blocco" style="margin-top:16px">
      <h3>Strategia d'acquisto per la ${esc(r.a.marca)} ${esc(r.a.modello)}</h3>
      <p class="piccolo" style="margin-top:6px">Prezzo stimato ${eur(r.s.prezzo)} + immatricolazione. Tasso usato: TAN ${num(f.tan * 100, 2)}% (modificabile qui sopra). In verde la combinazione consigliata.</p>
      <div class="tabella-wrap" style="box-shadow:none;margin-top:10px"><table>
        <thead><tr><th>Anticipo</th>${durate.map(m => `<th>${m} mesi</th>`).join('')}</tr></thead>
        <tbody>${anticipi.map(a => `<tr><th>${eur(a)}</th>${durate.map(m => { const c = calc(a, m); const best = a === consiglioAnticipo && m === durataOk; return `<td class="${best ? 'meglio' : ''}" style="${c.rata > lim ? 'opacity:.55' : ''}">${eur(c.rata)}/mese<div class="muto piccolo">interessi ${eur(c.interessi)}</div></td>`; }).join('')}</tr>`).join('')}</tbody>
      </table></div>
      <p class="piccolo ${durataOk ? '' : 'neg-num'}" style="margin-top:10px">${lim < Infinity ? (durataOk ? `<b>Con la tua rata massima di ${eur(lim)}:</b> servono ${durataOk} mesi con ${eur(consiglioAnticipo)} di anticipo. In grigio le combinazioni sopra il limite.` : `<b>Con la tua rata massima di ${eur(lim)} quest'auto non ci sta</b> nemmeno in 96 mesi: servirebbe un prezzo intorno a ${eur(prezzoMax(84))} (84 mesi) o ${eur(prezzoMax(60))} (60 mesi).`) : ''}</p>
      <ul class="piccolo" style="margin:12px 0 0;padding-left:18px;display:grid;gap:6px">
        <li><b>Anticipo:</b> ${f.tan > rend ? `metti il massimo (${eur(max)}): il finanziamento costa il ${num(f.tan * 100, 2)}%, più di quanto renderebbero quei soldi (~${num(rend * 100, 1)}%).` : `tieni l'anticipo basso: il finanziamento costa meno di quanto rendono i tuoi soldi.`}</li>
        <li><b>Durata:</b> la più corta che rispetta la tua rata massima. Ogni anno in più di finanziamento costa circa ${eur((calc(consiglioAnticipo, 96).interessi - calc(consiglioAnticipo, 48).interessi) / 4)} di interessi. Puoi sempre anticipare l'estinzione se avanzano soldi (penale massima 1%).</li>
        <li><b>Formula:</b> chiedi ammortamento completo, senza maxirata. Se la promo migliore è solo con maxirata, fatti scrivere il costo di estinzione anticipata e fai il conto: spesso conviene prendere la promo e chiudere prima.</li>
        <li><b>Trattativa:</b> prima concorda il prezzo dell'auto, poi il finanziamento. Chiedi per iscritto TAEG e modulo SECCI e confrontali con un prestito della tua banca. Con Mazda fai valere che sei già cliente: chiedi il tasso fedeltà, storicamente 1-2 punti sotto lo standard.</li>
        <li><b>Quando:</b> raccogli i preventivi tra gennaio e marzo, firma a fine trimestre (seconda metà di marzo), quando i concessionari devono chiudere gli obiettivi. La raccomandata per restituire la CX-5 va spedita entro il 16 marzo.</li>
      </ul>
    </div>`;
  }
  function pannelloTassi() {
    const f = (D.contesto || {}).finanziamenti; if (!f) return '';
    const off = (f.offerte_case || []).filter(o => o.tan != null);
    const pm = f.previsione_marzo_2027 || {};
    return `<div class="pannello blocco" style="margin-top:16px">
      <h3>Tassi e promozioni: cosa aspettarsi a marzo</h3>
      ${pm.sintesi ? `<p style="margin-top:8px">${esc(pm.sintesi)}</p>` : ''}
      ${pm.migliore_finestra ? `<p class="piccolo" style="margin-top:6px"><b>Quando firmare:</b> ${esc(pm.migliore_finestra)}</p>` : ''}
      <div class="tabella-wrap" style="box-shadow:none;margin-top:12px"><table>
        <thead><tr><th>Offerta oggi</th><th>TAN</th><th>TAEG</th><th>Valida</th></tr></thead>
        <tbody>${off.map(o => `<tr><td><b>${esc(o.marca)}</b> ${esc(o.modello || '')}${o.dettaglio ? `<div class="muto piccolo">${esc(o.dettaglio)}</div>` : ''}</td><td>${esc(o.tan)}%</td><td>${esc(o.taeg ?? '—')}%</td><td class="piccolo">${esc(o.data_validita || '')}</td></tr>`).join('')}</tbody>
      </table></div>
      ${f.bce && f.bce.attuale ? `<p class="muto piccolo" style="margin-top:8px">BCE: depositi al ${esc(f.bce.attuale.depositi)}% (${esc(f.bce.attuale.data)}). ${esc((f.bce.previsione_2027 || {}).dettaglio || '')}</p>` : ''}
    </div>`;
  }
  function energiaPannello(s) {
    const e = D.energia_casa; if (!e || !e.mensile) return '';
    const fabb = P.km_anno * s.consumo / 100;
    const pranzo = (e.stima_ricarica_pranzo || {}).kwh_anno_giorni_feriali || 0;
    const a25 = (e.annuale || {})['2025'] || {};
    return `<div class="pannello blocco" style="margin-top:16px">
      <h3>Il tuo fotovoltaico di casa (dati Home Assistant)</h3>
      <p class="piccolo" style="margin-top:6px">Nel 2025 hai prodotto <b>${num(a25.produzione)} kWh</b> e ne hai regalati alla rete <b>${num(a25.immissione)}</b>. L'auto ne chiede circa <b>${num(fabb)} kWh</b> l'anno: a pranzo (13-14:30, giorni feriali) ne puoi prendere gratis circa <b>${num(pranzo)}</b>, cioè il ${num(pranzo / fabb * 100)}%. Il resto arriva dall'ufficio, dalla rete di notte o dalle colonnine.</p>
      <div class="grafico" style="height:240px;margin-top:12px"><canvas id="gEnergia"></canvas></div>
      ${e.nota ? `<p class="muto piccolo" style="margin-top:6px">${esc(e.nota)}</p>` : ''}</div>`;
  }
  function graficoEnergia() {
    const el = $('#gEnergia'), e = D.energia_casa; if (!el || !e) return;
    const st = stileGrafico();
    const ult = e.mensile.filter(m => !m.parziale).slice(-12);
    grafici.gEnergia = new Chart(el, {
      type: 'bar',
      data: { labels: ult.map(m => dataIt(m.mese, { month: 'short' })), datasets: [
        { label: 'Prodotta', data: ult.map(m => m.produzione), backgroundColor: css('--zolfo'), borderRadius: 4 },
        { label: 'Regalata alla rete', data: ult.map(m => m.immissione), backgroundColor: css('--acciaio'), borderRadius: 4 },
        { label: 'Presa dalla rete', data: ult.map(m => m.prelievo), backgroundColor: css('--muto'), borderRadius: 4 }
      ] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: st.text, boxWidth: 12 } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${num(c.parsed.y)} kWh` } } },
        scales: { x: { grid: { display: false }, ticks: { color: st.text } }, y: { grid: { color: st.grid }, ticks: { color: st.text } } } }
    });
  }

  // ---------- NOVITÀ ----------
  function vNovita() {
    const news = [...(D.news || [])].sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    const cal = [...(D.calendario || [])].sort((a, b) => (a.data_prevista || '').localeCompare(b.data_prevista || ''));
    $('#tab-novita').innerHTML = `
      <div class="griglia-2" style="grid-template-columns:1.5fr 1fr;align-items:start">
        <div><header style="margin-bottom:14px"><h2>Novità</h2><p class="muto" style="margin-top:6px">Quello che lo staff ha trovato e perché conta per la tua scelta.</p></header>
          <div class="news">${news.map(n => `<article class="notizia ${n.impatto === 'alto' ? 'alto' : ''}">
            <div class="meta"><span>${dataIt(n.data)}</span><span class="chip">${esc(n.categoria || '')}</span>${n.impatto ? `<span class="chip ${n.impatto === 'alto' ? 'zolfo' : ''}">impatto ${esc(n.impatto)}</span>` : ''}</div>
            <h3>${esc(n.titolo)}</h3><p>${esc(n.sintesi)}</p>
            ${n.url ? `<a class="piccolo" href="${esc(n.url)}" target="_blank" rel="noopener">Leggi la fonte</a>` : ''}</article>`).join('') || '<p class="muto">Nessuna novità.</p>'}</div></div>
        <div class="pannello"><h2 style="font-size:1.3rem">Cosa aspettarsi fino a giugno</h2>
          <div class="cal" style="margin-top:10px">${cal.map(e => `<div class="evento ${e.tipo === 'scadenza' ? 'scadenza' : ''}"><span class="d">${dataIt(e.data_prevista, { month: 'short', year: 'numeric', ...(e.data_prevista && e.data_prevista.length > 7 ? { day: 'numeric' } : {}) })}</span><div>${esc(e.evento)} <span class="chip">${esc(e.certezza || '')}</span></div></div>`).join('')}</div></div>
      </div>`;
  }

  // ---------- STAFF ----------
  function vStaff() {
    const cx = (D.contesto || {});
    $('#tab-staff').innerHTML = `
      <header style="margin-bottom:14px"><h2>Lo staff</h2><p class="muto" style="margin-top:6px">Ogni domenica ognuno fa il suo lavoro; il direttore mette insieme il verdetto.</p></header>
      <div class="staff-grid">${(D.staff || []).map(s => `<article class="agente">
        <header><div class="avatar" style="background:var(${s.colore})">${esc(s.sigla)}</div><div><h3>${esc(s.nome)}</h3><span class="muto piccolo">${esc(s.ruolo)}</span></div></header>
        <ul>${(s.compiti || []).map(c => `<li>${esc(c)}</li>`).join('')}</ul>
        ${s.ultimo_report ? `<p class="piccolo"><b>Ultimo report:</b> ${esc(s.ultimo_report)}</p>` : ''}</article>`).join('')}</div>
      ${cx.fisco_privato_vs_azienda ? `<div class="pannello blocco"><h3>Privato o azienda agricola</h3><p style="margin-top:8px">${esc(cx.fisco_privato_vs_azienda.conclusione || '')}</p></div>` : ''}
      ${cx.incentivi ? `<div class="pannello blocco" style="margin-top:16px"><h3>Incentivi</h3><p style="margin-top:8px">${esc(cx.incentivi.sintesi || '')}</p></div>` : ''}
      <div class="pannello blocco" style="margin-top:16px"><h3>Come si calcola</h3><p class="piccolo" style="margin-top:8px">Per ogni auto si confrontano due strade da maggio 2027: tenere la CX-5 pagando la maxirata, oppure uscirne (restituzione o vendita, la più economica) e comprare l'elettrica con anticipo e finanziamento. Ogni anno si sommano rate, energia, manutenzione, gomme, assicurazione e bollo; si sottrae quanto varrebbe l'auto se la vendessi. La differenza tra le due strade è il tuo guadagno o la tua perdita. Il punteggio su 100 unisce questo risultato ai voti tecnici dello staff, con i pesi che puoi cambiare nella sezione Conti. Le chimiche NMC perdono ${P.penalita_nmc} punto sul voto batteria.</p></div>`;
  }
})();
