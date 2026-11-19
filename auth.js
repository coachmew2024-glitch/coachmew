/* Coach Mew Mastermind — members (login, profile, my results, bookings, admin)
   Real site: Supabase Auth through supabase-js (loaded from the CDN before this file).
   Trial files (folder 2) add their own pretend backend with sample data; it is not part of the real site.
   Who may read or change what is enforced by Row Level Security in 3-Supabase-SQL/supabase-login.sql,
   not by this file: hiding a button here is only for convenience. */
(function(){
  'use strict';
  const C = Cosmic.CONFIG, esc = Cosmic.esc;
  const TRIAL = !!window.__COSMIC_TRIAL;
  const here = new URL('.', location.href);                 // folder of the site (works under /coachmew/ on GitHub Pages)
  const abs = p => new URL(p, here).href;

  // Only pages of this site may be used as "go back to" targets (blocks open redirects)
  const PAGES = ['index.html', 'quiz.html', 'account.html', 'admin.html'];
  function safeNext(n){
    if(!n) return '';
    const page = String(n).split(/[?#]/)[0];
    return PAGES.includes(page) && /^[\w.\-]+(\?[\w=&%\-]*)?(#[\w\-]*)?$/.test(n) ? n : '';
  }
  const loginUrl = next => 'login.html' + (safeNext(next) ? '?next=' + encodeURIComponent(safeNext(next)) : '');

  // ===== Real backend (Supabase) =====
  function realBackend(){
    if(!window.supabase || !window.supabase.createClient) throw Object.assign(new Error('supabase-js not loaded'), {code:'offline'});
    const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, {
      auth:{flowType:'pkce', persistSession:true, autoRefreshToken:true, detectSessionInUrl:true}
    });
    const must = ({data, error}) => { if(error) throw error; return data; };
    const uid = async () => { const {data:{session}} = await sb.auth.getSession(); return session ? session.user.id : null; };
    return {
      sb,
      async user(){ const {data:{session}} = await sb.auth.getSession(); return session ? session.user : null; },
      onChange(fn){ sb.auth.onAuthStateChange((event)=>fn(event)); },
      async oauth(provider, next){
        must(await sb.auth.signInWithOAuth({provider, options:{redirectTo:abs(loginUrl(next))}}));
      },
      async signIn(email, password){ must(await sb.auth.signInWithPassword({email, password})); return {session:true}; },
      async signUp(email, password, meta, next){
        const d = must(await sb.auth.signUp({email, password, options:{data:meta, emailRedirectTo:abs(loginUrl(next))}}));
        // an address that already has an account comes back with no identities (Supabase hides that it exists)
        if(d.user && Array.isArray(d.user.identities) && d.user.identities.length === 0) throw {code:'user_already_exists'};
        return {session:!!d.session};
      },
      async resend(email, next){ must(await sb.auth.resend({type:'signup', email, options:{emailRedirectTo:abs(loginUrl(next))}})); },
      async resetPassword(email){ must(await sb.auth.resetPasswordForEmail(email, {redirectTo:abs('login.html?mode=reset')})); },
      async updatePassword(password){ must(await sb.auth.updateUser({password})); },
      async signOut(){ await sb.auth.signOut(); },
      async profile(){
        const id = await uid(); if(!id) return null;
        return must(await sb.from('profiles').select('*').eq('id', id).maybeSingle());
      },
      async acceptTerms(marketing){ must(await sb.rpc('accept_terms', {p_marketing:!!marketing})); },
      async setMarketing(on){ must(await sb.rpc('set_marketing_consent', {p_consent:!!on})); },
      async setName(name){ must(await sb.from('profiles').update({display_name:name}).eq('id', await uid())); },
      async isAdmin(){ return !!must(await sb.rpc('is_admin')); },
      async saveResult(row){
        const id = await uid(); if(!id) throw {code:'not_signed_in'};
        return must(await sb.from('cosmic_results').insert(Object.assign({}, row, {user_id:id})).select('id').single()).id;
      },
      async myResults(){
        return must(await sb.from('cosmic_results').select('id,created_at,answers,score_g,score_d,score_t,score_v,leading_types')
          .eq('user_id', await uid()).order('created_at', {ascending:false}));
      },
      async result(id){
        return must(await sb.from('cosmic_results').select('id,created_at,user_id,answers,score_g,score_d,score_t,score_v,leading_types').eq('id', id).maybeSingle());
      },
      async myBookings(){
        return must(await sb.from('bookings').select('id,package,starts_at,status,note,created_at,updated_at')
          .eq('user_id', await uid()).order('starts_at', {ascending:false, nullsFirst:true}));
      },
      async deleteAccount(){ must(await sb.rpc('delete_my_account')); await sb.auth.signOut({scope:'local'}); },
      admin:{
        async members(){ return must(await sb.rpc('admin_members')); },
        async bookings(){ return must(await sb.rpc('admin_bookings')); },
        async results(){     // every result (also older ones without an account), 1000 rows per request
          const all = [];
          for(let from = 0; ; from += 1000){
            const rows = must(await sb.from('cosmic_results').select('id,created_at,session_id,user_id,score_g,score_d,score_t,score_v,leading_types')
              .order('created_at', {ascending:false}).range(from, from + 999));
            all.push(...rows); if(rows.length < 1000) return all;
          }
        },
        async addBooking(row){ must(await sb.from('bookings').insert(row)); },
        async updateBooking(id, row){ must(await sb.from('bookings').update(row).eq('id', id)); },
      },
    };
  }

  let api, apiError = null;
  // trial files (folder 2) bring their own pretend backend; the real site always uses Supabase
  try{ api = TRIAL && window.CosmicMock ? window.CosmicMock.backend(loginUrl) : realBackend(); }catch(e){ apiError = e; }

  // ===== Thai error messages =====
  function thaiError(e){
    const code = (e && (e.code || e.error_code || e.error)) || '', msg = String((e && (e.message || e.error_description)) || '');
    const has = s => code === s || msg.toLowerCase().includes(s.replace(/_/g, ' '));
    if(code === 'offline' || /failed to fetch|networkerror|load failed/i.test(msg)) return 'เชื่อมต่อระบบไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง';
    if(has('invalid_credentials') || /invalid login credentials/i.test(msg)) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
    if(has('email_not_confirmed')) return 'ยังไม่ได้ยืนยันอีเมล กรุณากดลิงก์ยืนยันในอีเมลที่เราส่งไปก่อน';
    if(has('user_already_exists') || /already registered/i.test(msg)) return 'อีเมลนี้สมัครสมาชิกไว้แล้ว ลองเข้าสู่ระบบ หรือกด "ลืมรหัสผ่าน"';
    if(has('weak_password') || /password should/i.test(msg)) return 'รหัสผ่านสั้นหรือเดาง่ายเกินไป ใช้อย่างน้อย 8 ตัวอักษร ผสมตัวอักษรกับตัวเลข';
    if(has('same_password')) return 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม';
    if(/over_email_send_rate_limit|email rate limit/i.test(code + msg)) return 'ส่งอีเมลบ่อยเกินไป กรุณารอประมาณ 1 ชั่วโมงแล้วลองใหม่';
    if(/rate_limit|too many/i.test(code + msg) || e && e.status === 429) return 'ลองหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่';
    if(has('email_address_invalid') || /invalid.*email|email.*invalid/i.test(msg)) return 'รูปแบบอีเมลไม่ถูกต้อง';
    if(has('provider_disabled') || /unsupported provider|provider is not enabled/i.test(msg)) return 'ช่องทางเข้าสู่ระบบนี้ยังไม่เปิดใช้งาน';
    if(/otp_expired|flow_state|expired|invalid.*(link|token|code)/i.test(code + msg)) return 'ลิงก์หมดอายุหรือถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่อีกครั้ง';
    if(has('access_denied')) return 'ยกเลิกการเข้าสู่ระบบแล้ว';
    if(has('signup_disabled')) return 'ตอนนี้ยังปิดรับสมัครสมาชิกใหม่';
    if(code === 'not_signed_in') return 'กรุณาเข้าสู่ระบบก่อน';
    if(code === '42501' || /permission denied|row-level security/i.test(msg)) return 'บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้';
    return 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง';
  }

  // ===== Who is here =====
  let statePromise = null;
  function ready(force){
    if(force) statePromise = null;
    if(!statePromise) statePromise = (async () => {
      if(!api) return {user:null, profile:null, admin:false, member:false, error:apiError};
      try{
        const user = await api.user();
        if(!user) return {user:null, profile:null, admin:false, member:false};
        const [profile, admin] = await Promise.all([api.profile(), api.isAdmin().catch(() => false)]);
        return {user, profile, admin, member:!!(profile && profile.accepted_terms_at)};
      }catch(e){ console.error(e); return {user:null, profile:null, admin:false, member:false, error:e}; }
    })();
    return statePromise;
  }
  // Pages for members: not signed in (or consent not given yet) → login page, then straight back here
  async function requireMember(next){
    const s = await ready();
    if(!s.member){ location.replace(loginUrl(next)); return new Promise(() => {}); }
    return s;
  }

  const nameOf = (s) => (s.profile && s.profile.display_name) ||
    (s.user && s.user.user_metadata && (s.user.user_metadata.full_name || s.user.user_metadata.name)) ||
    (s.user && s.user.email ? s.user.email.split('@')[0] : 'สมาชิก');

  function avatarHTML(s, cls = 'avatar'){
    const url = s.profile && s.profile.avatar_url;
    if(url && /^https:\/\//.test(url)) return `<img class="${cls}" src="${esc(url)}" alt="" referrerpolicy="no-referrer" width="36" height="36">`;
    return `<span class="${cls}" aria-hidden="true">${esc(nameOf(s).trim().charAt(0).toUpperCase() || '✦')}</span>`;
  }

  // ===== Header: "เข้าสู่ระบบ" or name/picture + menu =====
  let navListeners = false;
  async function renderNav(){
    const nav = document.querySelector('header .nav');
    if(!nav) return;
    let box = document.getElementById('navUser');
    if(!box){ box = document.createElement('div'); box.id = 'navUser'; box.className = 'nav-user'; nav.insertBefore(box, document.getElementById('burger')); }
    const page = location.pathname.split('/').pop() || 'index.html';
    if(page === 'login.html'){ box.hidden = true; return; }
    const s = await ready();
    box.hidden = false;
    if(!s.user){
      const back = safeNext(page + location.search) || '';
      box.innerHTML = `<a class="btn btn-line nav-login" href="${esc(loginUrl(back))}">เข้าสู่ระบบ</a>`;
      return;
    }
    box.innerHTML = `
      <button type="button" class="user-btn" id="userBtn" aria-haspopup="true" aria-expanded="false" aria-controls="userMenu">
        ${avatarHTML(s)}<span class="user-name">${esc(nameOf(s))}</span><span class="caret" aria-hidden="true">▾</span>
      </button>
      <ul class="user-menu" id="userMenu" hidden>
        <li class="who"><b>${esc(nameOf(s))}</b>${s.user.email ? `<small>${esc(s.user.email)}</small>` : ''}</li>
        <li><a href="account.html">ดาวของฉัน</a></li>
        ${s.admin ? '<li><a href="admin.html">หลังบ้าน</a></li>' : ''}
        <li><button type="button" id="navLogout">ออกจากระบบ</button></li>
      </ul>`;
    const btn = box.querySelector('#userBtn'), menu = box.querySelector('#userMenu');
    const open = on => { menu.hidden = !on; btn.setAttribute('aria-expanded', on); };
    btn.onclick = e => { e.stopPropagation(); open(menu.hidden); };
    if(!navListeners){
      navListeners = true;
      document.addEventListener('click', e => { const b = document.getElementById('navUser'), m = document.getElementById('userMenu');
        if(m && b && !b.contains(e.target)){ m.hidden = true; document.getElementById('userBtn').setAttribute('aria-expanded', false); } });
      document.addEventListener('keydown', e => { const m = document.getElementById('userMenu');
        if(e.key === 'Escape' && m && !m.hidden){ m.hidden = true; document.getElementById('userBtn').setAttribute('aria-expanded', false); } });
    }
    box.querySelector('#navLogout').onclick = signOut;
  }

  async function signOut(){
    try{ await api.signOut(); }catch(e){}
    location.href = 'index.html';
  }

  // ===== Shared formatting =====
  const STATUS = {pending:'รอยืนยัน', confirmed:'ยืนยันแล้ว', done:'เสร็จแล้ว', cancelled:'ยกเลิก'};
  const fmtDate = (iso, time = true) => iso ? new Date(iso).toLocaleString('th-TH', time ? {dateStyle:'medium', timeStyle:'short'} : {dateStyle:'medium'}) : '–';
  const typeNames = (data, codes) => String(codes || '').split('').filter(c => data.types[c]).map(c => data.types[c].display_name).join(' + ') || '–';

  // Course buttons need an account (free): signed-out visitors go to the login page first, then come back
  let memberNow = null;
  ready().then(s => { memberNow = s.member; });
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[data-track="cta_course"]');
    if(!a || memberNow) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const page = location.pathname.split('/').pop() || 'index.html';
    location.href = loginUrl(page === 'quiz.html' ? 'quiz.html?after=course' : page === 'index.html' ? 'index.html#course' : page);
  }, true);

  document.addEventListener('DOMContentLoaded', () => { if(TRIAL && window.CosmicMock) window.CosmicMock.bar(api); renderNav(); });
  if(api && api.onChange) api.onChange(ev => { if(ev === 'SIGNED_OUT'){ ready(true); renderNav(); } });   // signed out in another tab

  window.CosmicAuth = {api, TRIAL, ready, requireMember, loginUrl, safeNext, thaiError, nameOf, avatarHTML, signOut,
    STATUS, fmtDate, typeNames, renderNav};
})();
