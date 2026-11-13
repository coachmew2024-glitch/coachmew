/* Coach Mew Mastermind — shared code for index.html and quiz.html
   All quiz text comes from data/cosmic-identity.json (source of truth). Nothing here repeats it. */
(function(){
  'use strict';

  // ===== Settings you may need to change =====
  const CONFIG = {
    // ลิงก์ LINE OA ของครูมิว เช่น 'https://lin.ee/xxxxxxx' — ถ้าเว้นว่าง ปุ่ม LINE จะขึ้นว่า "เร็ว ๆ นี้" และกดไม่ได้
    LINE_URL: '',
    SUPABASE_URL: 'https://xkbhhtauzqgvryeocmiz.supabase.co',
    SUPABASE_KEY: 'sb_publishable_14U9zriQnKcTb7PSA97zMQ_g1DuzDy-',   // publishable key (ปลอดภัยที่จะอยู่ในหน้าเว็บ)
    DATA_URL: 'data/cosmic-identity.json',
  };

  // ===== Star icons (placeholder until the final characters arrive — swap the SVG here) =====
  const svg = body => `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const ICONS = {
    G: svg('<circle cx="32" cy="32" r="11"/><path d="M32 8v8M32 48v8M8 32h8M48 32h8M15 15l5.7 5.7M49 15l-5.7 5.7M15 49l5.7-5.7M49 49l-5.7-5.7"/>'),
    D: svg('<circle cx="44" cy="20" r="8"/><path d="M38 27 12 53M43 29 24 50M36 22 14 42"/><path d="M14 14v4M12 16h4"/>'),
    T: svg('<circle cx="32" cy="32" r="12"/><ellipse cx="32" cy="32" rx="27" ry="8" transform="rotate(-20 32 32)"/>'),
    V: svg('<path d="M40 9a23 23 0 1 0 15 35A19 19 0 0 1 40 9z"/><path d="M50 14v4M48 16h4"/>'),
    logo: svg('<path d="M32 6c2 14 6 18 20 20-14 2-18 6-20 20-2-14-6-18-20-20 14-2 18-6 20-20z" fill="currentColor" stroke="none"/><circle cx="50" cy="48" r="3" fill="currentColor" stroke="none"/>'),
  };

  // ===== Data =====
  let dataPromise = null;
  function loadData(){
    if(!dataPromise){
      dataPromise = fetch(CONFIG.DATA_URL, {cache:'no-cache'}).then(r=>{
        if(!r.ok) throw new Error('โหลดข้อมูลแบบทดสอบไม่สำเร็จ (' + r.status + ')');
        return r.json();
      });
    }
    return dataPromise;
  }

  // ===== Scoring (rules from JSON → scoring) =====
  // answers: array of 12 options ('A'–'D'), in question order
  function score(data, answers){
    const codes = Object.keys(data.types);                  // G, D, T, V
    const scores = Object.fromEntries(codes.map(c=>[c,0]));
    data.questions.forEach((q,i)=>{
      const a = q.answers.find(x=>x.option === answers[i]);
      if(!a) throw new Error('ยังตอบไม่ครบ: ' + q.id);
      scores[a.type_code] += data.scoring.points_per_answer;
    });
    const total = data.scoring.total_questions;
    const max = Math.max(...codes.map(c=>scores[c]));
    const leading = codes.filter(c=>scores[c] === max);       // tie → every top type, never random
    const pct = c => (Math.round(scores[c] / total * 1000) / 10).toFixed(1);
    return {scores, leading, total, pct};
  }

  // ===== Safe storage (sessionStorage can be blocked) =====
  const store = {
    get(k){ try{ return JSON.parse(sessionStorage.getItem(k)); }catch(e){ return null; } },
    set(k,v){ try{ sessionStorage.setItem(k, JSON.stringify(v)); }catch(e){} },
    del(k){ try{ sessionStorage.removeItem(k); }catch(e){} },
  };

  // UTM from ads: remember for this visit so it survives moving from index.html to quiz.html
  const UTM_KEYS = ['utm_source','utm_medium','utm_campaign','utm_content'];
  const params = new URLSearchParams(location.search);
  if(UTM_KEYS.some(k=>params.get(k))){
    store.set('cosmic-utm', Object.fromEntries(UTM_KEYS.map(k=>[k, (params.get(k)||'').slice(0,200) || null])));
  }
  const utm = () => store.get('cosmic-utm') || {};

  // Anonymous session id (no name / email anywhere)
  function sessionId(){
    let id = store.get('cosmic-session');
    if(!id){
      id = (crypto.randomUUID && crypto.randomUUID()) ||
        ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c=>(c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
      store.set('cosmic-session', id);
    }
    return id;
  }
  function newSession(){ store.del('cosmic-session'); return sessionId(); }

  // ===== Supabase (anonymous, insert-only; failures never block the visitor) =====
  function post(table, row){
    if(!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY) return Promise.resolve();
    const headers = {apikey:CONFIG.SUPABASE_KEY, 'Content-Type':'application/json', Prefer:'return=minimal'};
    if(CONFIG.SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = 'Bearer ' + CONFIG.SUPABASE_KEY;
    return fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${table}`, {method:'POST', keepalive:true, headers, body:JSON.stringify(row)})
      .catch(()=>{});
  }
  const sent = new Set();
  function track(event, extra = {}, once = false){
    const key = event + (extra.question_no || '');
    if(once){ if(sent.has(key)) return; sent.add(key); }
    post('cosmic_events', Object.assign({session_id:sessionId(), event, question_no:null, option:null}, extra, utm()));
  }
  function saveResult(answers, r){
    post('cosmic_results', Object.assign({
      session_id: sessionId(),
      answers: answers.join(''),
      score_g: r.scores.G, score_d: r.scores.D, score_t: r.scores.T, score_v: r.scores.V,
      leading_types: r.leading.join(''),
    }, utm()));
  }

  // ===== Small helpers =====
  const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function lineButton(label, cls, event){
    if(CONFIG.LINE_URL){
      return `<a class="btn ${cls}" href="${esc(CONFIG.LINE_URL)}" target="_blank" rel="noopener" data-track="${event||''}">${esc(label)}</a>`;
    }
    return `<span class="btn ${cls}" aria-disabled="true" title="ยังไม่ได้ใส่ลิงก์ LINE">${esc(label)} · เร็ว ๆ นี้</span>`;
  }
  function toast(msg){
    const t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role','status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(()=>t.remove(), 2200);
  }

  // Mobile menu (both pages)
  document.addEventListener('DOMContentLoaded', ()=>{
    const burger = document.getElementById('burger'), menu = document.getElementById('menu');
    if(burger && menu){
      burger.addEventListener('click', ()=>{ const o = menu.classList.toggle('open'); burger.setAttribute('aria-expanded', o); });
      menu.querySelectorAll('a').forEach(a=>a.addEventListener('click', ()=>{ menu.classList.remove('open'); burger.setAttribute('aria-expanded','false'); }));
    }
    document.querySelectorAll('[data-icon]').forEach(el=>{ el.innerHTML = ICONS[el.dataset.icon] || ''; });
    document.querySelectorAll('[data-line]').forEach(el=>{ el.outerHTML = lineButton(el.dataset.line, el.className.replace('btn','').trim(), el.dataset.track); });
  });

  window.Cosmic = {CONFIG, ICONS, loadData, score, store, sessionId, newSession, track, saveResult, esc, lineButton, toast};
})();
