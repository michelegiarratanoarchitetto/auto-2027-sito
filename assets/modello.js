/* Modello economico Auto 2027.
   Posizione netta a fine anno y = soldi usciti fino a quel momento − valore dell'auto se la vendessi + debito residuo.
   Confronto sempre con lo scenario base "tengo la CX-5" (pago la maxirata e la uso altri 10 anni). */
(function () {
  const M = {};

  M.rata = (capitale, tan, mesi) => {
    if (capitale <= 0) return 0;
    const i = tan / 12;
    return i === 0 ? capitale / mesi : capitale * i / (1 - Math.pow(1 + i, -mesi));
  };

  M.debitoResiduo = (capitale, tan, mesi, mesiPagati) => {
    if (capitale <= 0 || mesiPagati >= mesi) return 0;
    const i = tan / 12, r = M.rata(capitale, tan, mesi);
    if (i === 0) return capitale - r * mesiPagati;
    return capitale * Math.pow(1 + i, mesiPagati) - r * (Math.pow(1 + i, mesiPagati) - 1) / i;
  };

  M.prezzoEffettivo = (a) => {
    const s = a.prezzo_stimato_marzo_2027;
    if (Array.isArray(s) && s.length === 2 && s[0] && s[1]) return Math.round((s[0] + s[1]) / 2);
    if (typeof s === 'number') return s;
    return a.prezzo_listino || null;
  };

  M.consumo = (a) => {
    if (a.consumo_reale_kwh100) return a.consumo_reale_kwh100;
    const kwh = a.batteria && a.batteria.kwh_netti, w = a.wltp_km;
    return kwh && w ? +(kwh / w * 100 * 1.12).toFixed(1) : 18;
  };

  // curva valore: punti (anni, % del prezzo)
  M.valorePct = (a, y) => {
    const r = a.valore_residuo_pct || {};
    const r5 = (r['5_anni'] || 50) / 100, r10 = (r['10_anni'] || 28) / 100;
    const pts = [[0, 1], [1, Math.min(0.84, r5 + 0.3)], [5, r5], [10, r10], [15, r10 * 0.6]];
    for (let k = 1; k < pts.length; k++) {
      if (y <= pts[k][0]) {
        const [x0, v0] = pts[k - 1], [x1, v1] = pts[k];
        return v0 + (v1 - v0) * (y - x0) / (x1 - x0);
      }
    }
    return pts[pts.length - 1][1];
  };

  // Salute della batteria dopo N anni (stima): LFP ~1,2%/anno, NMC ~1,7%/anno, salvo valore specifico nella scheda.
  M.salute = (a, anni = 10) => {
    const b = a.batteria || {};
    if (b.soh_10_anni) return b.soh_10_anni;
    const lfp = /LFP|LMFP|fosfat/i.test(b.chimica || '');
    const nmc = /NMC|NCA|ternar/i.test(b.chimica || '');
    const perAnno = lfp ? 0.012 : nmc ? 0.017 : 0.015;
    return +(1 - perAnno * anni).toFixed(2);
  };
  M.autonomiaFutura = (a, anni = 10) => {
    const r = a.autonomia_reale_km || {}, s = M.salute(a, anni);
    const f = v => v ? Math.round(v * s) : null;
    const mite = r.misto_mite || (a.wltp_km ? a.wltp_km * 0.85 : null);
    return { salute: s, mite: f(mite), inverno: f(r.inverno || (mite ? mite * 0.87 : null)), autostrada: f(r.autostrada_130) };
  };

  M.costoKwh = (p) => {
    const mix = p.ricarica_mix, c = p.costo_kwh;
    let tot = 0, peso = 0;
    for (const k in mix) { tot += mix[k] * (c[k] || 0); peso += mix[k]; }
    return peso ? tot / peso : 0.15;
  };

  M.uscitaCX5 = (p) => {
    const c = p.cx5;
    const penale = Math.max(0, c.km_previsti_scadenza - c.km_contratto) * c.penale_km;
    const vendita = c.maxirata - c.valore_privato_maggio_2027; // >0 = ci rimetti
    return vendita < penale
      ? { modo: 'vendita privata', costo: vendita, penale, vendita }
      : { modo: 'restituzione al concessionario', costo: penale, penale, vendita };
  };

  M.scenarioCX5 = (p) => {
    const c = p.cx5, N = p.orizzonte_anni, km = p.km_anno;
    const out = [], spese = [];
    let cum = c.maxirata; // pago la maxirata a maggio 2027
    const v0 = c.valore_privato_maggio_2027, vN = v0 * c.valore_residuo_pct_10_anni_dopo;
    const k = Math.pow(vN / v0, 1 / 10);
    out.push(cum - v0);
    for (let y = 1; y <= N; y++) {
      const carburante = km * c.consumo_l_100km / 100 * c.prezzo_benzina;
      const manut = c.manutenzione_anno * Math.pow(1 + c.manutenzione_crescita_anno, y - 1);
      const anno = carburante + manut + c.assicurazione_anno + c.bollo_anno;
      cum += anno;
      spese.push({ carburante, manut, assic: c.assicurazione_anno, bollo: c.bollo_anno });
      out.push(cum - v0 * Math.pow(k, y));
    }
    return { nome: 'Tengo la CX-5', netto: out, spese, valoreFinale: v0 * Math.pow(k, N) };
  };

  M.scenarioEV = (a, p, opz = {}) => {
    const N = p.orizzonte_anni, km = p.km_anno, f = p.finanziamento, e = p.ev;
    const prezzo = opz.prezzo || M.prezzoEffettivo(a);
    if (!prezzo) return null;
    const uscita = M.uscitaCX5(p);
    const totale = prezzo + e.spese_immatricolazione;
    const anticipo = Math.min(f.anticipo, totale);
    const capitale = Math.max(0, totale - anticipo);
    const finanziato = capitale > 0 ? capitale + f.spese_istruttoria : 0;
    const rata = M.rata(finanziato, f.tan, f.mesi);
    const cons = M.consumo(a) * (1 + p.perdite_ricarica_ac);
    const eurKwh = M.costoKwh(p);
    const beneficio = opz.beneficioFiscale || 0;
    let cum = uscita.costo + anticipo;
    const spese = [];
    // anno 0: appena immatricolata l'auto vale ~92% del prezzo pagato
    const out = [cum - (prezzo * 0.92 - finanziato)];
    let interessi = 0;
    for (let y = 1; y <= N; y++) {
      const mesiAnno = Math.max(0, Math.min(12, f.mesi - (y - 1) * 12));
      const rate = rata * mesiAnno;
      const debPrima = M.debitoResiduo(finanziato, f.tan, f.mesi, (y - 1) * 12);
      const debDopo = M.debitoResiduo(finanziato, f.tan, f.mesi, y * 12);
      interessi += rate - (debPrima - debDopo);
      const energia = km * cons / 100 * eurKwh;
      const gomme = km / e.pneumatici_ogni_km * e.costo_treno_gomme;
      const bollo = y <= e.bollo_esente_anni ? 0 : e.bollo_dopo;
      const anno = rate + energia + e.manutenzione_anno + gomme + e.assicurazione_anno + bollo - beneficio / N;
      cum += anno;
      spese.push({ rate, energia, manut: e.manutenzione_anno, gomme, assic: e.assicurazione_anno, bollo });
      out.push(cum - (prezzo * M.valorePct(a, y) - debDopo));
    }
    return {
      nome: `${a.marca} ${a.modello}`, prezzo, anticipo, finanziato, rata, interessi, energiaKwh: eurKwh,
      consumo: cons, uscita, netto: out, spese, valoreFinale: prezzo * M.valorePct(a, N)
    };
  };

  M.confronto = (ev, base) => {
    const delta = ev.netto.map((v, i) => base.netto[i] - v); // >0 = guadagni rispetto a tenere la CX-5
    const pareggio = delta.findIndex((d, i) => i > 0 && d > 0);
    return { delta, pareggio: pareggio === -1 ? null : pareggio, finale: delta[delta.length - 1] };
  };

  M.CRITERI = {
    economia: 'Conti a 10 anni', qualita_assemblaggi: 'Qualità e assemblaggi', nvh: 'Silenzio',
    affidabilita: 'Affidabilità', batteria_efficienza: 'Batteria ed efficienza', autonomia_viaggi: 'Autonomia e viaggi',
    spazio_famiglia: 'Spazio famiglia', assistenza: 'Assistenza in Sicilia', software_ota: 'Software e aggiornamenti'
  };

  M.punteggio = (a, votoEconomia, p) => {
    const w = p.pesi_punteggio, v = Object.assign({}, a.voti || {});
    v.economia = votoEconomia;
    if (a.batteria && /NMC|NCA|ternar/i.test(a.batteria.chimica || '') && v.batteria_efficienza)
      v.batteria_efficienza = Math.max(1, v.batteria_efficienza - p.penalita_nmc);
    let tot = 0, pesi = 0;
    for (const k in w) { if (v[k] != null) { tot += v[k] * w[k]; pesi += w[k]; } }
    return pesi ? Math.round(tot / pesi * 10) : null;
  };

  M.classifica = (auto, p, opzPerAuto = {}) => {
    const base = M.scenarioCX5(p);
    const righe = auto.map(a => {
      const s = M.scenarioEV(a, p, opzPerAuto[a.id] || {});
      return s ? { a, s, c: M.confronto(s, base) } : null;
    }).filter(Boolean);
    righe.forEach(r => {
      const ar = r.a.autonomia_reale_km || {}, dim = r.a.dimensioni || {};
      const reale = ar.misto_mite || (r.a.wltp_km ? r.a.wltp_km * 0.85 : 0);
      r.esclusioni = [];
      if (!['in_vendita', 'in_arrivo'].includes(r.a.stato)) r.esclusioni.push('non disponibile o scartata');
      const tettoListino = p.tetto_listino || Infinity;
      const listinoOk = r.a.prezzo_listino && r.a.prezzo_listino <= tettoListino;
      if (r.s.prezzo > p.tetto_prezzo && !listinoOk)
        r.esclusioni.push(r.a.prezzo_listino ? `listino ${Math.round(r.a.prezzo_listino).toLocaleString('it-IT')} € sopra ${tettoListino.toLocaleString('it-IT')} €` : 'prezzo sopra il tetto');
      const soglia = p.autonomia_minima_km || 420;
      r.avvisi = [];
      if (reale < soglia * 0.97) r.esclusioni.push(`autonomia reale ~${Math.round(reale)} km, sotto ${soglia}`);
      else if (reale < soglia) r.avvisi.push(`autonomia al limite: ~${Math.round(reale)} km stimati contro ${soglia} richiesti`);
      if (dim.lunghezza_mm && dim.lunghezza_mm < 4550) r.esclusioni.push(`più corta della CX-5 (${(dim.lunghezza_mm / 1000).toFixed(2)} m)`);
      if (dim.bagagliaio_l && dim.bagagliaio_l < 440) r.esclusioni.push(`bagagliaio ${dim.bagagliaio_l} L, troppo piccolo`);
      else if (dim.bagagliaio_l && dim.bagagliaio_l < 480) r.avvisi.push(`bagagliaio ${dim.bagagliaio_l} L, meno dei 506 L della CX-5`);
      if (p.rata_massima && r.s.rata > p.rata_massima * 1.02) {
        const mm = p.finanziamento.mesi_massimi || p.finanziamento.mesi, i = p.finanziamento.tan / 12;
        const finMax = p.rata_massima * (1 - Math.pow(1 + i, -mm)) / i;
        r.prezzoPerRata = Math.round(finMax + (r.s.anticipo || 0) - (p.finanziamento.spese_istruttoria || 0) - (p.ev.spese_immatricolazione || 0));
        r.avvisi.push(`rata ${Math.round(r.s.rata)} € in ${p.finanziamento.mesi} mesi, sopra i tuoi ${p.rata_massima} €: servirebbe un prezzo finale di circa ${r.prezzoPerRata.toLocaleString('it-IT')} € (sconti o bonus per ${Math.round(r.s.prezzo - r.prezzoPerRata).toLocaleString('it-IT')} €)`);
      }
      r.reale = Math.round(reale);
      r.idonea = r.esclusioni.length === 0;
    });
    const rif = righe.filter(r => r.idonea);
    const migliore = Math.max(...(rif.length ? rif : righe).map(r => r.c.finale));
    righe.forEach(r => {
      r.votoEconomia = +Math.max(1, Math.min(10, 10 - (migliore - r.c.finale) / 1200)).toFixed(1);
      const nVoti = Object.keys(r.a.voti || {}).length;
      r.punteggio = nVoti >= 5 ? M.punteggio(r.a, r.votoEconomia, p) : null;
    });
    righe.sort((x, y) => (y.idonea - x.idonea) || ((y.punteggio ?? -1) - (x.punteggio ?? -1)));
    return { base, righe };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = M; else window.Modello = M;
})();
