/* ============================================================
   app.js — الواجهة والتفاعل
   ============================================================ */
'use strict';

(function () {

  /* ---------------- أدوات مساعدة ---------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
  const LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function pct(n) { return (Math.round((n || 0) * 10) / 10) + '%'; }
  function toast(msg, type) {
    const wrap = $('#toastWrap');
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; el.style.transition = '.25s'; }, 2600);
    setTimeout(() => el.remove(), 3000);
  }
  function fmtDate(ts) {
    const d = new Date(ts);
    const pad = n => String(n).padStart(2, '0');
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' - ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function grade(p) {
    if (p >= 90) return { label: 'ممتاز', cls: 'ok' };
    if (p >= 80) return { label: 'جيد جداً', cls: 'ok' };
    if (p >= 70) return { label: 'جيد', cls: 'brand' };
    if (p >= 60) return { label: 'مقبول', cls: 'warn' };
    return { label: 'ضعيف', cls: 'err' };
  }
  function download(filename, content, mime) {
    const blob = new Blob(['\ufeff' + content], { type: (mime || 'text/plain') + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
  }

  /* ---------------- المودال ---------------- */
  const Modal = (() => {
    const backdrop = $('#modalBackdrop');
    const box = $('#modal');
    let onClose = null;

    function open(html, after) {
      box.innerHTML = html;
      backdrop.hidden = false;
      document.body.style.overflow = 'hidden';
      if (after) after(box);
    }
    function close() {
      backdrop.hidden = true;
      box.innerHTML = '';
      document.body.style.overflow = '';
      const cb = onClose; onClose = null;
      if (cb) cb();
    }
    function confirm(opts) {
      return new Promise(resolve => {
        open(
          '<h3>' + escapeHtml(opts.title || 'تأكيد') + '</h3>' +
          '<p>' + (opts.body || '') + '</p>' +
          '<div class="modal-actions">' +
          '<button class="btn btn-ghost" data-m="cancel">' + escapeHtml(opts.cancelText || 'إلغاء') + '</button>' +
          '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-m="ok">' + escapeHtml(opts.okText || 'تأكيد') + '</button>' +
          '</div>',
          b => {
            b.querySelector('[data-m="cancel"]').onclick = () => { close(); resolve(false); };
            b.querySelector('[data-m="ok"]').onclick = () => { close(); resolve(true); };
          }
        );
      });
    }
    function alert(opts) {
      open(
        '<h3>' + escapeHtml(opts.title || '') + '</h3>' +
        '<p>' + (opts.body || '') + '</p>' +
        '<div class="modal-actions"><button class="btn btn-primary" data-m="ok">حسناً</button></div>',
        b => { b.querySelector('[data-m="ok"]').onclick = close; }
      );
    }
    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !backdrop.hidden) close(); });
    return { open, close, confirm, alert };
  })();

  /* ---------------- حالة التطبيق ---------------- */
  const State = {
    view: 'home',
    attempt: null,
    timerId: null,
    setup: { source: 'set', setId: null, count: 'all' },
    resultFilter: 'wrong',
    reviewExpanded: {}
  };

  /* ---------------- التنقل ---------------- */
  function setNav(name) {
    $$('#mainNav .nav-btn').forEach(b => b.classList.toggle('is-active', b.dataset.nav === name));
  }
  function showView(name) {
    State.view = name;
    $$('#app .view').forEach(v => { v.hidden = v.id !== 'view-' + name; });
    setNav(name);
    $('#mainNav').classList.remove('open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function refreshBadges() {
    const n = Bank.size();
    const badge = $('#navBankBadge');
    badge.hidden = n === 0;
    badge.textContent = n;
  }

  /* ============================================================
     الصفحة الرئيسية
     ============================================================ */
  function renderHome() {
    const s = Settings.all();
    const history = History.all();
    const avg = History.average();
    const best = History.best();
    const bankStats = Bank.stats();

    const recent = History.last(8).slice().reverse();

    let html = '';

    html += '' +
      '<div class="hero">' +
        '<div class="hero-inner">' +
          '<h1>منصة الامتحان المحوسب — علوم الإنتاج الحيواني</h1>' +
          '<p>امتحانات احترافية من 100 سؤال مع تصحيح فوري، وبنك أسئلة تلقائي يجمع كل إجاباتك الخاطئة لتُعيد التدريب عليها.</p>' +
          '<div class="hero-actions">' +
            '<button class="btn btn-gold btn-lg" data-action="start-all">امتحان شامل عشوائي (100 سؤال)</button>' +
            '<button class="btn btn-ghost btn-lg" data-action="quick-practice">تدريب سريع (10 أسئلة)</button>' +
            (Bank.size() ? '<button class="btn btn-ghost btn-lg" data-action="start-bank">امتحان من بنك الأخطاء (' + Bank.size() + ')</button>' : '') +
          '</div>' +
          '<div class="hero-stats">' +
            '<div class="hero-stat"><b>' + DB.total + '</b><span>سؤال في بنك الأسئلة</span></div>' +
            '<div class="hero-stat"><b>' + DB.bigSets.length + '</b><span>امتحان شامل (100 سؤال)</span></div>' +
            '<div class="hero-stat"><b>' + history.length + '</b><span>محاولة مسجلة</span></div>' +
            '<div class="hero-stat"><b>' + pct(avg) + '</b><span>متوسط النتائج</span></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    if (ActiveAttempt.load()) {
      html += '<div class="card tight" style="border-color:var(--gold-400); background:var(--warn-50)">' +
        '<div class="spread"><div><strong>لديك امتحان غير مكتمل.</strong> <span class="small muted">يمكنك استئنافه من حيث توقفت.</span></div>' +
        '<div class="row"><button class="btn btn-primary btn-sm" data-action="resume">استئناف الامتحان</button>' +
        '<button class="btn btn-ghost btn-sm" data-action="discard-active">حذف</button></div></div></div>';
    }

    /* لوحة الإحصاءات السريعة */
    html += '<div class="section-head"><h2>لوحة المتابعة</h2></div>';
    html += '<div class="stat-grid">' +
      statCard('brand', iconBook(), History.all().length, 'محاولات مكتملة') +
      statCard('ok', iconTarget(), pct(avg), 'متوسط النسبة') +
      statCard('gold', iconStar(), best ? pct(best.scorePercent) : '—', 'أفضل نتيجة' + (best ? ' (' + escapeHtml(best.title) + ')' : '')) +
      statCard('err', iconBank(), Bank.size(), 'أسئلة في بنك الأخطاء') +
      '</div>';

    if (recent.length) {
      html += '<div class="card" style="margin-top:16px">' +
        '<div class="card-head"><h3 class="card-title">' + iconChart() + ' آخر المحاولات</h3>' +
        '<button class="btn btn-ghost btn-sm" data-action="nav" data-nav="history">عرض السجل الكامل</button></div>' +
        '<div class="mini-chart">' +
        recent.map(a => {
          const v = Math.max(3, a.scorePercent);
          const cls = a.scorePercent >= 70 ? '' : (a.scorePercent >= 50 ? 'mid' : 'poor');
          return '<div class="bar ' + cls + '" title="' + escapeHtml(a.title) + ' — ' + pct(a.scorePercent) + '"><i style="height:' + v + '%"></i><span>' + a.scorePercent + '</span></div>';
        }).join('') +
        '</div></div>';
    }

    /* قائمة الامتحانات */
    html += '<div class="section-head"><h2>' + iconList() + ' الامتحانات الشاملة (100 سؤال)</h2>' +
      '<p>كل امتحان مبني على محاور تخصصية كاملة، والإجابة الصحيحة تُظهر بعد إنهاء الامتحان.</p></div>';
    html += '<div class="set-grid">' + DB.bigSets.map(setCard).join('') + '</div>';

    if (DB.smallSets.length) {
      html += '<div class="section-head"><h2>' + iconList() + ' مجموعات مختصرة</h2>' +
        '<p>مجموعات أصغر مفيدة للمراجعة السريعة.</p></div>';
      html += '<div class="set-grid">' + DB.smallSets.map(setCard).join('') + '</div>';
    }

    html += '<div class="minor-note small muted center" style="margin-top:24px">' +
      'الإعدادات الحالية: ' + (s.shuffleOptions ? 'ترتيب عشوائي للخيارات' : 'ترتيب أصلي للخيارات') + ' • ' +
      (s.timerEnabled ? ('مؤقت ' + s.secondsPerQuestion + ' ثانية/سؤال') : 'بدون مؤقت') + ' • ' +
      (s.instantFeedback ? 'تصحيح فوري' : 'إظهار الإجابات بعد الإنهاء') +
      ' <button class="btn btn-ghost btn-sm" data-action="nav" data-nav="settings" style="margin-inline-start:8px">تعديل</button>' +
      '</div>';

    $('#view-home').innerHTML = html;
  }

  function statCard(tone, ico, val, lbl) {
    return '<div class="stat-card"><div class="ico ' + tone + '">' + ico + '</div>' +
      '<div class="val">' + val + '</div><div class="lbl">' + lbl + '</div></div>';
  }

  function setCard(set) {
    return '<article class="set-card">' +
      '<div class="set-card-top">' +
        '<div class="set-num ' + (set.isBig ? '' : 'small-set') + '">' + escapeHtml(set.badge) + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<h3>' + escapeHtml(set.title) + '</h3>' +
          '<div class="set-meta" style="margin-top:6px">' +
            '<span class="chip brand">' + set.size + ' سؤال</span>' +
            '<span class="chip">' + set.chapters.length + ' محاور</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="set-chapters">' +
        set.chapters.slice(0, 6).map(c =>
          '<div>' + iconDot() + '<span>' + escapeHtml(DB.stripChapterPrefix(c)) + '</span></div>'
        ).join('') +
      '</div>' +
      '<div class="set-actions">' +
        '<button class="btn btn-primary btn-sm" data-action="start-set" data-set="' + set.id + '">ابدأ الامتحان</button>' +
        '<button class="btn btn-ghost btn-sm" data-action="review-set" data-set="' + set.id + '">مراجعة سريعة</button>' +
      '</div>' +
    '</article>';
  }

  /* ---------------- أيقونات SVG مختصرة ---------------- */
  function svg(path, size) {
    return '<svg viewBox="0 0 24 24" width="' + (size || 18) + '" height="' + (size || 18) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
  }
  const iconBook = (s) => svg('<path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2Z"/><path d="M8 3v18"/>', s);
  const iconTarget = (s) => svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>', s);
  const iconStar = (s) => svg('<path d="m12 3 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.4 6.8 19.2l1-5.9L3.5 9.2l5.9-.8Z"/>', s);
  const iconBank = (s) => svg('<path d="M12 3 3 7l9 4 9-4-9-4Z"/><path d="M3 12l9 4 9-4"/><path d="M3 17l9 4 9-4"/>', s);
  const iconChart = (s) => svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', s);
  const iconList = (s) => svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>', s);
  const iconDot = (s) => svg('<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="9"/>', s || 13);
  const iconClock = (s) => svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', s);
  const iconCheck = (s) => svg('<path d="m5 13 4 4L19 7"/>', s);
  const iconX = (s) => svg('<path d="M6 6l12 12M18 6 6 18"/>', s);
  const iconFlag = (s) => svg('<path d="M5 21V4h14l-3 5 3 5H5"/>', s);
  const iconTrash = (s) => svg('<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>', s);
  const iconPrint = (s) => svg('<path d="M7 9V3h10v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v7H7z"/>', s);
  const iconHome = (s) => svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v10h14V10"/>', s);

  /* ============================================================
     شاشة إعداد الامتحان
     ============================================================ */
  function openSetup(source, setId) {
    let count = 'all';
    if (source === 'all' && DB.total > 100) count = 100;
    if (source === 'bank' && Bank.size() > 25) count = Math.min(Bank.size(), 25);
    State.setup = { source: source, setId: setId || null, count: count };
    renderSetup();
    showView('setup');
  }

  function setupPool() {
    const cfg = State.setup;
    if (cfg.source === 'set') {
      const s = DB.sets.find(x => x.id === cfg.setId);
      return s ? s.questions.length : 0;
    }
    if (cfg.source === 'bank') return Bank.size();
    return DB.total;
  }

  function setupTitle() {
    const cfg = State.setup;
    if (cfg.source === 'set') {
      const s = DB.sets.find(x => x.id === cfg.setId);
      return s ? s.title : 'امتحان';
    }
    if (cfg.source === 'bank') return 'امتحان بنك الأخطاء';
    return 'امتحان شامل عشوائي';
  }

  function setupSubtitle() {
    const cfg = State.setup;
    if (cfg.source === 'set') {
      const s = DB.sets.find(x => x.id === cfg.setId);
      return s ? s.subtitle : '';
    }
    if (cfg.source === 'bank') return 'أسئلة أخطأت فيها سابقاً';
    return 'يُختار عشوائياً من ' + DB.total + ' سؤال';
  }

  function renderSetup() {
    const pool = setupPool();
    const s = Settings.all();
    const cfg = State.setup;
    const presets = [];
    [10, 25, 50, 100].forEach(n => { if (n < pool) presets.push(n); });
    presets.push('all');

    const count = cfg.count === 'all' ? pool : Math.min(cfg.count, pool);
    const estMinutes = Math.round((count * s.secondsPerQuestion) / 60);

    let html = '';
    html += '<div class="spread" style="margin-bottom:16px">' +
      '<div><div class="section-head" style="margin:0"><h2>' + escapeHtml(setupTitle()) + '</h2>' +
      '<p>' + escapeHtml(setupSubtitle()) + '</p></div></div>' +
      '<button class="btn btn-ghost btn-sm" data-action="nav" data-nav="home">' + iconHome(16) + ' الرئيسية</button>' +
      '</div>';

    html += '<div class="setup-wrap">';

    html += '<div class="setup-panel">';
    /* نوع الأسئلة */
    html += '<div class="card">' +
      '<div class="card-head"><h3 class="card-title">' + iconList() + ' مجموعة الأسئلة</h3>' +
      '<span class="chip">' + pool + ' سؤال متاح</span></div>' +
      '<div class="field"><label>اختر مصدر الأسئلة</label><div class="opt-group" id="sourceGroup">' +
        sourceTile('set', 'امتحان محدد', 'إحدى المجموعات الشاملة') +
        sourceTile('bank', 'بنك الأخطاء', Bank.size() + ' سؤال خاطئ') +
        sourceTile('all', 'كامل البنك', DB.total + ' سؤال') +
      '</div></div>' +
      '<div class="field" id="setPickerField" style="margin-top:14px">' +
        '<label>المجموعة</label>' +
        '<select id="setPicker">' +
          DB.sets.map(set => '<option value="' + set.id + '"' + (set.id === cfg.setId ? ' selected' : '') + '>' +
            escapeHtml(set.title + ' — ' + set.size + ' سؤال') + '</option>').join('') +
        '</select>' +
      '</div>' +
    '</div>';

    /* عدد الأسئلة */
    html += '<div class="card">' +
      '<div class="card-head"><h3 class="card-title">' + iconTarget() + ' عدد الأسئلة</h3></div>' +
      '<div class="opt-group" id="countGroup">' +
        presets.map(p => {
          const val = (p === 'all') ? 'all' : String(p);
          const label = (p === 'all') ? 'الكل' : String(p);
          const sub = (p === 'all') ? (pool + ' سؤال') : Math.round((p / pool) * 100) + '% من المجموعة';
          const selected = (cfg.count === 'all' && p === 'all') || (cfg.count !== 'all' && p === cfg.count);
          return '<button type="button" class="opt-tile' + (selected ? ' is-selected' : '') + '" data-action="pick-count" data-count="' + val + '"><b>' + label + '</b><span>' + sub + '</span></button>';
        }).join('') +
      '</div>' +
      '<div class="row" style="margin-top:14px">' +
        '<div class="field" style="flex:1;min-width:180px"><label>أو اكتب عدداً مخصصاً</label>' +
        '<input type="number" id="customCount" min="1" max="' + pool + '" value="' + count + '" />' +
        '</div>' +
        '<button class="btn btn-soft" data-action="apply-count" style="align-self:flex-end">تطبيق</button>' +
      '</div>' +
    '</div>';

    /* خيارات */
    html += '<div class="card">' +
      '<div class="card-head"><h3 class="card-title">' + iconFlag() + ' خيارات الامتحان</h3></div>' +
      '<div class="stack">' +
        switchRow('setup-shuffle-options', 'خلط ترتيب الخيارات', 'يمنع حفظ مواضع الإجابات', s.shuffleOptions) +
        switchRow('setup-shuffle-questions', 'خلط ترتيب الأسئلة', 'ترتيب مختلف في كل محاولة', s.shuffleQuestions) +
        switchRow('setup-instant', 'تصحيح فوري بعد كل سؤال', 'مفيد للتدريب والمراجعة', s.instantFeedback) +
        switchRow('setup-timer', 'تفعيل المؤقت الزمني', 'إيقاف تلقائي عند انتهاء الوقت', s.timerEnabled) +
        '<div class="row">' +
          '<div class="field" style="flex:1;min-width:170px"><label>ثوانٍ لكل سؤال (للمؤقت)</label>' +
          '<input type="number" id="setupSecPerQ" min="10" max="300" value="' + s.secondsPerQuestion + '" /></div>' +
          '<div class="field" style="flex:1;min-width:170px"><label>درجة النجاح (%)</label>' +
          '<input type="number" id="setupPass" min="1" max="100" value="' + s.passMark + '" /></div>' +
        '</div>' +
      '</div>' +
    '</div>';
    html += '</div>'; /* end setup-panel */

    /* الملخص */
    html += '<aside class="summary-box">' +
      '<h3 class="card-title">' + iconCheck() + ' ملخص الامتحان</h3>' +
      '<div class="summary-row"><span>المصدر</span><b>' + escapeHtml(setupTitle()) + '</b></div>' +
      '<div class="summary-row"><span>عدد الأسئلة</span><b>' + count + '</b></div>' +
      '<div class="summary-row"><span>مدة الامتحان</span><b>' + (s.timerEnabled ? (estMinutes + ' دقيقة') : 'بدون مؤقت') + '</b></div>' +
      '<div class="summary-row"><span>تصحيح</span><b>' + (s.instantFeedback ? 'فوري' : 'بعد الإنهاء') + '</b></div>' +
      '<div class="summary-row"><span>درجة النجاح</span><b>' + s.passMark + '%</b></div>' +
      '<div class="summary-div"></div>' +
      '<div class="small muted">بعد الإنهاء تظهر الإجابة الصحيحة لكل سؤال، وتُضاف أسئلتك الخاطئة تلقائياً إلى بنك الأخطاء لبناء امتحان جديد منها.</div>' +
      '<button class="btn btn-primary btn-lg" data-action="begin" style="width:100%">ابدأ الامتحان الآن</button>' +
      (Bank.size() ? '<button class="btn btn-ghost" data-action="start-bank" style="width:100%">الانتقال إلى بنك الأخطاء (' + Bank.size() + ')</button>' : '') +
    '</aside>';

    html += '</div>';

    $('#view-setup').innerHTML = html;
  }

  function sourceTile(value, title, sub) {
    const cfg = State.setup;
    const selected = cfg.source === value;
    const disabled = (value === 'bank' && Bank.size() === 0) ? ' disabled' : '';
    return '<button type="button" class="opt-tile' + (selected ? ' is-selected' : '') + '"' + disabled +
      ' data-action="pick-source" data-source="' + value + '"><b>' + escapeHtml(title) + '</b><span>' + escapeHtml(sub) + '</span></button>';
  }
  function switchRow(id, title, sub, checked) {
    return '<label class="spread" style="gap:14px">' +
      '<span><b style="display:block">' + escapeHtml(title) + '</b><span class="small muted">' + escapeHtml(sub) + '</span></span>' +
      '<span class="switch"><input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + ' /><span></span></span>' +
      '</label>';
  }

  /* ============================================================
     شاشة الامتحان
     ============================================================ */
  function beginExam(config) {
    const attempt = Quiz.build(config);
    if (!attempt || !attempt.questions.length) { toast('لا توجد أسئلة متاحة لهذا الامتحان', 'err'); return; }
    startAttempt(attempt);
  }

  function startAttempt(attempt) {
    State.attempt = attempt;
    State.reviewExpanded = {};
    if (attempt.timerEnabled && attempt.endsAt && attempt.endsAt <= Date.now()) {
      // إعادة ضبط المؤقت بعد استئناف محاولة قديمة
      attempt.endsAt = Date.now() + (attempt.totalSeconds || 3600) * 1000;
      toast('تمت إعادة ضبط المؤقت بعد استئناف المحاولة');
    }
    ActiveAttempt.save(attempt);
    renderExam();
    showView('exam');
    startTimer();
  }

  function renderExam() {
    const a = State.attempt;
    if (!a) { showView('home'); return; }

    let html = '';
    html += '<div class="exam-top">' +
      '<div class="exam-top-row">' +
        '<span class="exam-title">' + escapeHtml(a.title) + '</span>' +
        '<span class="q-counter" id="examCounter"></span>' +
        (a.timerEnabled ? '<span class="timer" id="examTimer">' + iconClock(16) + '<span>00:00</span></span>' : '') +
        '<span class="exam-top-progress" style="flex:1;min-width:120px"><span class="progress" id="examTopProgress"><i style="width:0%"></i></span></span>' +
        '<button class="btn btn-ghost btn-sm" data-action="focus">' + iconTarget(16) + ' <span>وضع التركيز</span></button>' +
        '<button class="btn btn-ghost btn-sm" data-action="nav" data-nav="home">خروج</button>' +
        '<button class="btn btn-primary btn-sm" data-action="finish">إنهاء الامتحان</button>' +
      '</div>' +
      '<div class="exam-credit">' +
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.4 5.1 5.6.8-4.1 4 .9 5.6L12 15.8 7.2 18.5l.9-5.6-4.1-4 5.6-.8Z"/></svg>' +
        '<span>إعداد وتصميم <b>المهندس أحمد الزن</b></span>' +
      '</div>' +
    '</div>';

    html += '<div class="exam-layout">' +
      '<div id="qArea"></div>' +
      '<aside class="exam-side" id="examSide"></aside>' +
    '</div>';

    $('#view-exam').innerHTML = html;

    renderQuestionArea();
    renderExamSide();
    updateExamTop();
  }

  function renderQuestionArea() {
    const a = State.attempt;
    const q = a.questions[a.index];
    if (!q) return;
    const instant = a.instantFeedback;
    const locked = instant && q.checked;
    const answered = q.chosen !== null && q.chosen !== undefined;

    let html = '<div class="q-card">';
    html += '<div class="q-head">' +
      '<span class="q-index">' + (a.index + 1) + '</span>' +
      '<span class="chip brand">' + escapeHtml(DB.stripChapterPrefix(q.chapter) || 'سؤال') + '</span>' +
      (instant && locked ? (q.chosen === q.answer
        ? '<span class="chip ok">' + iconCheck(14) + ' إجابة صحيحة</span>'
        : '<span class="chip err">' + iconX(14) + ' إجابة خاطئة</span>') : '') +
      '<span class="flags">' +
        '<button class="flag-btn' + (q.flagged ? ' is-on' : '') + '" data-action="flag">' + iconFlag(15) + ' ' + (q.flagged ? 'مُعلَّم' : 'علّم للمراجعة') + '</button>' +
      '</span>' +
    '</div>';

    html += '<div class="q-text">' + escapeHtml(q.q) + '</div>';
    html += '<div class="options">';
    q.options.forEach((opt, i) => {
      let cls = 'option';
      let mark = '';
      if (instant && locked) {
        cls += ' locked';
        if (i === q.answer) { cls += ' is-correct'; mark = '<span class="mark">الإجابة الصحيحة</span>'; }
        else if (i === q.chosen) { cls += ' is-wrong'; mark = '<span class="mark">اختيارك</span>'; }
      } else if (answered && i === q.chosen) {
        cls += ' is-selected';
      }
      html += '<button type="button" class="' + cls + '" data-action="choose" data-opt="' + i + '"' + (locked ? ' disabled' : '') + '>' +
        '<span class="key">' + LETTERS[i] + '</span><span>' + escapeHtml(opt) + '</span>' + mark + '</button>';
    });
    html += '</div>';

    if (instant && locked) {
      if (q.chosen === q.answer) {
        html += '<div class="q-note ok">' + iconCheck(18) + ' أحسنت! إجابتك صحيحة.</div>';
      } else {
        html += '<div class="q-note err">' + iconX(18) + ' إجابة خاطئة — الإجابة الصحيحة هي: «' + escapeHtml(q.options[q.answer]) + '» وسيُضاف السؤال إلى بنك الأخطاء.</div>';
      }
    }

    html += '<div class="exam-nav">' +
      '<button class="btn btn-ghost" data-action="prev"' + (a.index === 0 ? ' disabled' : '') + '>السابق</button>' +
      '<span class="q-counter">السؤال ' + (a.index + 1) + ' من ' + a.questions.length + '</span>' +
      '<span class="spacer"></span>' +
      (a.index === a.questions.length - 1
        ? '<button class="btn btn-success" data-action="finish">إنهاء وعرض النتيجة</button>'
        : '<button class="btn btn-primary" data-action="next">التالي</button>') +
    '</div>';

    html += '</div>';
    $('#qArea').innerHTML = html;
  }

  function renderExamSide() {
    const a = State.attempt;
    const stats = Quiz.liveStats(a);
    let html = '';

    html += '<div class="side-card">' +
      '<div class="spread" style="margin-bottom:10px"><strong>خريطة الأسئلة</strong>' +
      '<span class="small muted">' + stats.answered + '/' + stats.total + '</span></div>' +
      '<div class="q-map">' +
      a.questions.map((q, i) => {
        const answered = q.chosen !== null && q.chosen !== undefined;
        const cls = 'q-dot' + (answered ? ' answered' : '') + (q.flagged ? ' flagged' : '') + (i === a.index ? ' current' : '');
        return '<button type="button" class="' + cls + '" data-action="goto" data-i="' + i + '">' + (i + 1) + '</button>';
      }).join('') +
      '</div>' +
      '<div class="legend" style="margin-top:12px">' +
        '<div><i class="a"></i> تمت الإجابة: ' + stats.answered + '</div>' +
        '<div><i class="f"></i> مُعلَّم للمراجعة: ' + stats.flagged + '</div>' +
        '<div><i class="c"></i> السؤال الحالي</div>' +
      '</div>' +
    '</div>';

    if (a.instantFeedback) {
      const sc = Quiz.scoreSoFar(a);
      html += '<div class="side-card"><strong>النتيجة حتى الآن</strong>' +
        '<div class="row" style="margin-top:8px">' +
        '<span class="chip ok">صحيح: ' + sc.correct + '</span>' +
        '<span class="chip err">خطأ: ' + sc.wrong + '</span>' +
        '</div></div>';
    }

    html += '<div class="side-card">' +
      '<div class="small muted" style="margin-bottom:8px">اختصارات لوحة المفاتيح</div>' +
      '<div class="stack" style="gap:6px">' +
        '<div class="small"><span class="kbd">1</span> - <span class="kbd">4</span> اختيار الإجابة</div>' +
        '<div class="small"><span class="kbd">→</span> السؤال السابق • <span class="kbd">←</span> السؤال التالي</div>' +
        '<div class="small"><span class="kbd">F</span> تعليم للمراجعة • <span class="kbd">Enter</span> التالي</div>' +
      '</div>' +
    '</div>';

    $('#examSide').innerHTML = html;
  }

  function updateExamTop() {
    const a = State.attempt;
    const stats = Quiz.liveStats(a);
    const counter = $('#examCounter');
    if (counter) counter.textContent = 'السؤال ' + (a.index + 1) + ' من ' + a.questions.length + ' • تمت الإجابة ' + stats.answered;
    const bar = $('#examTopProgress > i');
    if (bar) bar.style.width = Math.round((stats.answered / stats.total) * 100) + '%';
  }

  function rerenderExam() {
    renderQuestionArea();
    renderExamSide();
    updateExamTop();
  }

  /* ---------------- المؤقّت ---------------- */
  function startTimer() {
    stopTimer();
    const a = State.attempt;
    if (!a || !a.timerEnabled || !a.endsAt) return;
    tick();
    State.timerId = setInterval(tick, 1000);
  }
  function stopTimer() {
    if (State.timerId) { clearInterval(State.timerId); State.timerId = null; }
  }
  function tick() {
    const a = State.attempt;
    if (!a || !a.endsAt) return;
    const left = Math.max(0, Math.round((a.endsAt - Date.now()) / 1000));
    const el = $('#examTimer');
    if (el) {
      el.innerHTML = iconClock(16) + '<span>' + Quiz.formatDuration(left) + '</span>';
      el.classList.toggle('warn', left <= 300 && left > 60);
      el.classList.toggle('danger', left <= 60);
    }
    if (left <= 0) {
      stopTimer();
      toast('انتهى الوقت المحدد — سيتم إنهاء الامتحان تلقائياً', 'err');
      finishExam(true);
    }
  }

  /* ---------------- إنهاء الامتحان ---------------- */
  async function finishExam(auto) {
    const a = State.attempt;
    if (!a) return;
    const stats = Quiz.liveStats(a);
    const remaining = stats.total - stats.answered;

    if (!auto && remaining > 0) {
      const ok = await Modal.confirm({
        title: 'إنهاء الامتحان؟',
        body: 'ما زال لديك <b>' + remaining + ' سؤالاً</b> بدون إجابة. هل تريد إنهاء الامتحان وعرض النتيجة؟',
        okText: 'إنهاء وعرض النتيجة',
        cancelText: 'متابعة الحل'
      });
      if (!ok) return;
    }
    stopTimer();
    Quiz.grade(a);
    ActiveAttempt.clear();
    State.attempt = null;
    renderResult(a);
    showView('result');
    refreshBadges();
  }

  /* ============================================================
     شاشة النتيجة
     ============================================================ */
  function renderResult(attempt) {
    State.lastAttempt = attempt;
    const r = attempt.result;
    if (r.wrong === 0 && r.skipped === 0) State.resultFilter = 'all';
    const g = grade(r.percent);
    const heroCls = r.passed ? '' : (r.percent >= 45 ? 'mid' : 'fail');
    const circumference = 2 * Math.PI * 62;
    const dash = (r.percent / 100) * circumference;

    let html = '';

    html += '<div class="result-hero ' + heroCls + '">' +
      '<div class="ring">' +
        '<svg width="158" height="158" viewBox="0 0 158 158">' +
          '<circle cx="79" cy="79" r="62" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="12"/>' +
          '<circle cx="79" cy="79" r="62" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" ' +
            'stroke-dasharray="' + dash + ' ' + circumference + '"/>' +
        '</svg>' +
        '<div class="ring-val"><b>' + r.percent + '%</b><span>' + (r.passed ? 'ناجح' : 'غير ناجح') + '</span></div>' +
      '</div>' +
      '<div>' +
        '<h2>' + escapeHtml(attempt.title) + '</h2>' +
        '<p>' + (r.passed ? 'أداء جيد! راجع الأسئلة الخاطئة لتثبيت المعلومة.' : 'تحتاج إلى مراجعة. أسئلتك الخاطئة جُمعت في بنك الأخطاء لتتدرب عليها.') + '</p>' +
        '<div class="result-badges">' +
          '<div class="result-badge"><b>' + r.correct + '</b>إجابة صحيحة</div>' +
          '<div class="result-badge"><b>' + r.wrong + '</b>إجابة خاطئة</div>' +
          '<div class="result-badge"><b>' + r.skipped + '</b>بدون إجابة</div>' +
          '<div class="result-badge"><b>' + Quiz.formatDuration(r.durationSec) + '</b>زمن الحل</div>' +
          '<div class="result-badge"><b>' + g.label + '</b>التقدير</div>' +
        '</div>' +
      '</div>' +
    '</div>';

    html += '<div class="row" style="margin:18px 0; flex-wrap:wrap">' +
      '<button class="btn btn-primary" data-action="retry-same">إعادة الامتحان نفسه</button>' +
      (r.wrong > 0 ? '<button class="btn btn-soft" data-action="retry-wrong">امتحان على أخطائي (' + r.wrong + ')</button>' : '') +
      '<button class="btn btn-ghost" data-action="print">' + iconPrint(16) + ' طبع النتيجة</button>' +
      (r.wrong > 0 ? '<button class="btn btn-ghost" data-action="export-wrong">تصدير الأخطاء (CSV)</button>' : '') +
      '<button class="btn btn-ghost" data-action="nav" data-nav="bank">بنك الأخطاء (' + Bank.size() + ')</button>' +
      '<button class="btn btn-ghost" data-action="nav" data-nav="home">الرئيسية</button>' +
    '</div>';

    html += '<div class="res-grid">';

    /* تحليل المحاور */
    html += '<div class="card">' +
      '<div class="card-head"><h3 class="card-title">' + iconChart() + ' التحليل حسب المحاور</h3></div>' +
      r.chapters.map(c => {
        const tone = c.percent >= 75 ? 'var(--ok-500)' : (c.percent >= 50 ? 'var(--gold-500)' : 'var(--err-500)');
        return '<div class="chap-row">' +
          '<div class="top"><span>' + escapeHtml(DB.stripChapterPrefix(c.name)) + '</span>' +
          '<span>' + c.correct + '/' + c.total + ' • ' + pct(c.percent) + '</span></div>' +
          '<div class="progress"><i style="width:' + c.percent + '%; background:' + tone + '"></i></div>' +
        '</div>';
      }).join('') +
    '</div>';

    /* ملخص سريع */
    const wrongUids = r.wrongUids || [];
    html += '<div class="card">' +
      '<div class="card-head"><h3 class="card-title">' + iconCheck() + ' ملخص وتوصيات</h3></div>' +
      '<div class="stack">' +
        '<div class="summary-row"><span>درجة النجاح المعتمدة</span><b>' + r.passMark + '%</b></div>' +
        '<div class="summary-row"><span>نتيجتك</span><b>' + pct(r.percent) + '</b></div>' +
        '<div class="summary-row"><span>مستوى الأداء</span><b>' + g.label + '</b></div>' +
        '<div class="summary-div"></div>' +
        '<div class="small muted">' + (wrongUids.length
          ? 'أُضيفت <b>' + wrongUids.length + '</b> أسئلة خاطئة إلى بنك الأخطاء. عند اجابتك صحيحاً على سؤال من البنك لاحقاً يُزال تلقائياً (يمكن تغيير ذلك من الإعدادات).'
          : 'ممتاز! لا توجد أسئلة خاطئة في هذه المحاولة.') + '</div>' +
        (wrongUids.length ? '<button class="btn btn-soft" data-action="retry-wrong">ابدأ امتحان بنك الأخطاء</button>' : '') +
      '</div>' +
    '</div>';

    html += '</div>';

    /* مراجعة الأسئلة */
    html += '<div class="card" style="margin-top:18px">' +
      '<div class="card-head"><h3 class="card-title">' + iconBook() + ' مراجعة الأسئلة والإجابات الصحيحة</h3></div>' +
      '<div class="review-toolbar">' +
        '<div class="seg" id="reviewSeg">' +
          '<button data-action="filter" data-filter="wrong" class="' + (State.resultFilter === 'wrong' ? 'is-active' : '') + '">الخاطئة (' + r.wrong + ')</button>' +
          '<button data-action="filter" data-filter="skipped" class="' + (State.resultFilter === 'skipped' ? 'is-active' : '') + '">بدون إجابة (' + r.skipped + ')</button>' +
          '<button data-action="filter" data-filter="all" class="' + (State.resultFilter === 'all' ? 'is-active' : '') + '">الكل (' + r.total + ')</button>' +
        '</div>' +
        '<span class="spacer" style="flex:1"></span>' +
        '<button class="btn btn-ghost btn-sm" data-action="expand-all">توسيع/طي الكل</button>' +
      '</div>' +
      '<div id="reviewList">' + reviewListHtml(attempt) + '</div>' +
    '</div>';

    html += '<div class="credit-line">إعداد وتصميم <b>المهندس أحمد الزن</b><br>منصة الامتحان المحوسب — علوم الإنتاج الحيواني</div>';

    $('#view-result').innerHTML = html;
  }

  function reviewListHtml(attempt) {
    const filter = State.resultFilter;
    let list = attempt.questions.map((q, i) => ({ q: q, i: i }));
    if (filter === 'wrong') list = list.filter(x => x.q.chosen !== null && x.q.chosen !== undefined && x.q.chosen !== x.q.answer);
    if (filter === 'skipped') list = list.filter(x => x.q.chosen === null || x.q.chosen === undefined);
    if (!list.length) {
      return '<div class="empty-state"><div class="big">🎉</div><h3>لا توجد أسئلة في هذا التصنيف</h3><p class="small">جرّب تصنيفاً آخر لعرض بقية الأسئلة.</p></div>';
    }
    return list.map(x => {
      const q = x.q;
      const answered = q.chosen !== null && q.chosen !== undefined;
      const isCorrect = answered && q.chosen === q.answer;
      const cls = isCorrect ? 'correct' : (answered ? 'wrong' : 'skipped');
      const statusChip = isCorrect ? '<span class="chip ok">صحيحة</span>' : (answered ? '<span class="chip err">خاطئة</span>' : '<span class="chip warn">بدون إجابة</span>');
      return '<div class="review-item ' + cls + '">' +
        '<div class="q-head" style="margin-bottom:8px">' +
          '<span class="q-index">' + (x.i + 1) + '</span>' +
          '<span class="chip">' + escapeHtml(DB.stripChapterPrefix(q.chapter) || 'سؤال') + '</span>' +
          statusChip +
        '</div>' +
        '<div class="review-q">' + escapeHtml(q.q) + '</div>' +
        '<div class="review-opts">' +
        q.options.map((opt, oi) => {
          let c = 'review-opt';
          let tag = '';
          if (oi === q.answer) { c += ' is-correct'; tag = '<span class="chip ok">الإجابة الصحيحة</span>'; }
          else if (answered && oi === q.chosen) { c += ' is-wrong'; tag = '<span class="chip err">اختيارك</span>'; }
          return '<div class="' + c + '"><span class="key">' + LETTERS[oi] + '</span><span style="flex:1">' + escapeHtml(opt) + '</span>' + tag + '</div>';
        }).join('') +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* ============================================================
     بنك الأخطاء
     ============================================================ */
  function renderBank() {
    const items = Bank.all();
    const stats = Bank.stats();
    const s = Settings.all();

    let html = '';
    html += '<div class="spread" style="margin-bottom:16px">' +
      '<div class="section-head" style="margin:0"><h2>' + iconBank() + ' بنك الأسئلة الخاطئة</h2>' +
      '<p>كل سؤال تُخطئ فيه أثناء أي امتحان يُجمع هنا تلقائياً لتبني منه امتحاناً جديداً.</p></div>' +
      '<button class="btn btn-ghost btn-sm" data-action="nav" data-nav="home">' + iconHome(16) + ' الرئيسية</button>' +
    '</div>';

    if (!items.length) {
      html += '<div class="card"><div class="empty-state"><div class="big">📚</div>' +
        '<h3>بنك الأخطاء فارغ حالياً</h3>' +
        '<p class="small">ابدأ أي امتحان، وكل سؤال تخطئ فيه سيُجمع هنا تلقائياً مع الإجابة الصحيحة.</p>' +
        '<button class="btn btn-primary" data-action="start-all" style="margin-top:12px">ابدأ امتحاناً الآن</button></div></div>';
      $('#view-bank').innerHTML = html;
      return;
    }

    html += '<div class="stat-grid" style="margin-bottom:18px">' +
      statCard('err', iconBank(), stats.total, 'سؤال في البنك') +
      statCard('gold', iconStar(), stats.repeated, 'أسئلة تكرر الخطأ فيها') +
      statCard('brand', iconChart(), stats.byChapter.size, 'محاور متأثرة') +
      statCard('ok', iconTarget(), s.removeOnCorrect ? 'مفعّل' : 'معطّل', 'إزالة السؤال عند الإجابة الصحيحة') +
      '</div>';

    html += '<div class="card tight" style="margin-bottom:16px">' +
      '<div class="spread">' +
        '<div class="row">' +
          '<button class="btn btn-primary" data-action="bank-exam">امتحان من بنك الأخطاء (' + stats.total + ')</button>' +
          '<button class="btn btn-ghost" data-action="bank-exam-custom">اختيار عدد مخصص</button>' +
        '</div>' +
        '<div class="row">' +
          '<button class="btn btn-ghost btn-sm" data-action="bank-export">تصدير البنك</button>' +
          '<button class="btn btn-ghost btn-sm" data-action="bank-import">استيراد</button>' +
          '<button class="btn btn-danger btn-sm" data-action="bank-clear">تفريغ البنك</button>' +
        '</div>' +
      '</div>' +
    '</div>';

    html += '<div class="card tight" style="margin-bottom:14px">' +
      '<div class="row">' +
        '<div class="field" style="flex:1;min-width:200px"><label>بحث في نص السؤال</label>' +
        '<input type="text" id="bankSearch" placeholder="اكتب كلمة للبحث..." /></div>' +
        '<div class="field" style="min-width:220px"><label>تصفية حسب المحور</label>' +
        '<select id="bankChapter"><option value="">كل المحاور</option>' +
        Array.from(stats.byChapter.keys()).map(c => '<option value="' + escapeHtml(c) + '">' + escapeHtml(DB.stripChapterPrefix(c)) + ' (' + stats.byChapter.get(c) + ')</option>').join('') +
        '</select></div>' +
        '<div class="field" style="min-width:180px"><label>الترتيب</label>' +
        '<select id="bankSort">' +
          '<option value="recent">الأحدث</option>' +
          '<option value="count">الأكثر تكراراً للخطأ</option>' +
          '<option value="chapter">حسب المحور</option>' +
        '</select></div>' +
      '</div>' +
    '</div>';

    html += '<div id="bankList">' + bankListHtml() + '</div>';

    $('#view-bank').innerHTML = html;
  }

  function bankListHtml() {
    const searchEl = $('#bankSearch');
    const chapEl = $('#bankChapter');
    const sortEl = $('#bankSort');
    const term = searchEl ? searchEl.value.trim() : '';
    const chap = chapEl ? chapEl.value : '';
    const sort = sortEl ? sortEl.value : 'recent';

    let items = Bank.all().slice();
    if (term) items = items.filter(i => i.q.indexOf(term) > -1 || (i.options || []).some(o => o.indexOf(term) > -1));
    if (chap) items = items.filter(i => (i.chapter || '') === chap);
    if (sort === 'recent') items.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
    if (sort === 'count') items.sort((a, b) => (b.wrongCount || 1) - (a.wrongCount || 1));
    if (sort === 'chapter') items.sort((a, b) => String(a.chapter).localeCompare(String(b.chapter), 'ar'));

    if (!items.length) return '<div class="empty-state"><div class="big">🔍</div><h3>لا نتائج مطابقة</h3><p class="small">جرّب تعديل كلمة البحث أو التصفية.</p></div>';

    return items.map(item => {
      const q = Bank.resolve(item);
      const expanded = !!State.reviewExpanded[item.uid];
      return '<div class="bank-item">' +
        '<div class="q-body">' +
          '<div class="row" style="gap:8px;margin-bottom:6px">' +
            '<span class="chip err">أُخطئ فيه ' + (item.wrongCount || 1) + ' مرة</span>' +
            '<span class="chip">' + escapeHtml(DB.stripChapterPrefix(item.chapter) || 'سؤال') + '</span>' +
            (item.lastAt ? '<span class="chip">آخر خطأ: ' + fmtDate(item.lastAt) + '</span>' : '') +
          '</div>' +
          '<p>' + escapeHtml(q.q) + '</p>' +
          (expanded ? '<div class="review-opts" style="margin-top:8px">' + q.options.map((opt, oi) =>
            '<div class="review-opt' + (oi === q.answer ? ' is-correct' : '') + '">' +
            '<span class="key">' + LETTERS[oi] + '</span><span style="flex:1">' + escapeHtml(opt) + '</span>' +
            (oi === q.answer ? '<span class="chip ok">الإجابة الصحيحة</span>' : '') + '</div>').join('') + '</div>' : '') +
        '</div>' +
        '<div class="bank-actions">' +
          '<button class="btn btn-ghost btn-sm" data-action="bank-toggle" data-uid="' + item.uid + '">' + (expanded ? 'إخفاء الإجابة' : 'عرض الإجابة') + '</button>' +
          '<button class="btn btn-ghost btn-sm" data-action="bank-practice" data-uid="' + item.uid + '">تدرّب عليه</button>' +
          '<button class="btn btn-danger btn-sm" data-action="bank-remove" data-uid="' + item.uid + '">' + iconTrash(15) + ' إزالة</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* ============================================================
     سجل النتائج
     ============================================================ */
  function renderHistory() {
    const items = History.all();
    let html = '';
    html += '<div class="spread" style="margin-bottom:16px">' +
      '<div class="section-head" style="margin:0"><h2>' + iconChart() + ' سجل النتائج</h2>' +
      '<p>تتبّع تطور مستواك عبر المحاولات السابقة.</p></div>' +
      '<button class="btn btn-ghost btn-sm" data-action="nav" data-nav="home">' + iconHome(16) + ' الرئيسية</button>' +
    '</div>';

    if (!items.length) {
      html += '<div class="card"><div class="empty-state"><div class="big">📝</div><h3>لا توجد محاولات مسجلة</h3>' +
        '<p class="small">ستظهر هنا نتائج كل امتحان تنهيه.</p>' +
        '<button class="btn btn-primary" data-action="start-all" style="margin-top:12px">ابدأ امتحاناً الآن</button></div></div>';
      $('#view-history').innerHTML = html;
      return;
    }

    const best = History.best();
    html += '<div class="stat-grid" style="margin-bottom:18px">' +
      statCard('brand', iconBook(), items.length, 'محاولة') +
      statCard('ok', iconTarget(), pct(History.average()), 'المتوسط العام') +
      statCard('gold', iconStar(), pct(best.scorePercent), 'أفضل نتيجة') +
      statCard('err', iconBank(), Bank.size(), 'أسئلة في بنك الأخطاء') +
      '</div>';

    html += '<div class="card tight" style="margin-bottom:12px"><div class="spread">' +
      '<span class="small muted">يتم الاحتفاظ بآخر 60 محاولة.</span>' +
      '<div class="row">' +
        '<button class="btn btn-ghost btn-sm" data-action="history-export">تصدير السجل</button>' +
        '<button class="btn btn-danger btn-sm" data-action="history-clear">مسح السجل</button>' +
      '</div></div></div>';

    html += '<div class="table-wrap"><table class="data"><thead><tr>' +
      '<th>التاريخ</th><th>الامتحان</th><th>الأسئلة</th><th>صحيح</th><th>خطأ</th><th>بدون إجابة</th><th>النسبة</th><th>النتيجة</th><th>المدة</th><th></th>' +
      '</tr></thead><tbody>' +
      items.map(a => {
        const g = grade(a.scorePercent);
        return '<tr>' +
          '<td>' + fmtDate(a.ts) + '</td>' +
          '<td><b>' + escapeHtml(a.title) + '</b></td>' +
          '<td>' + a.total + '</td>' +
          '<td style="color:var(--ok-600)"><b>' + a.correct + '</b></td>' +
          '<td style="color:var(--err-600)"><b>' + a.wrong + '</b></td>' +
          '<td>' + a.skipped + '</td>' +
          '<td><b>' + pct(a.scorePercent) + '</b></td>' +
          '<td><span class="chip ' + (a.passed ? 'ok' : 'err') + '">' + (a.passed ? 'ناجح' : 'غير ناجح') + ' • ' + g.label + '</span></td>' +
          '<td>' + Quiz.formatDuration(a.durationSec) + '</td>' +
          '<td><button class="btn btn-danger btn-sm" data-action="history-remove" data-id="' + a.id + '">' + iconTrash(14) + '</button></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';

    html += '<div class="small muted center" style="margin-top:12px">ملاحظة: النتائج التفصيلية لكل سؤال تُعرض بعد انتهاء الامتحان مباشرة، ويمكن طبعها.</div>';

    $('#view-history').innerHTML = html;
  }

  /* ============================================================
     الإعدادات
     ============================================================ */
  function renderSettings() {
    const s = Settings.all();
    let html = '';
    html += '<div class="spread" style="margin-bottom:16px">' +
      '<div class="section-head" style="margin:0"><h2>' + iconTarget() + ' الإعدادات</h2>' +
      '<p>تحكم في سلوك الامتحانات وتفضيلات العرض والبيانات.</p></div>' +
      '<button class="btn btn-ghost btn-sm" data-action="nav" data-nav="home">' + iconHome(16) + ' الرئيسية</button>' +
    '</div>';

    html += '<div class="res-grid">';

    html += '<div class="card"><div class="card-head"><h3 class="card-title">' + iconFlag() + ' سلوك الامتحان</h3></div>' +
      '<div class="stack">' +
        switchRow('set-shuffle-options', 'خلط ترتيب الخيارات', 'يُستخدم كافتراضي لكل امتحان جديد', s.shuffleOptions) +
        switchRow('set-shuffle-questions', 'خلط ترتيب الأسئلة', 'ترتيب مختلف في كل محاولة', s.shuffleQuestions) +
        switchRow('set-instant', 'تصحيح فوري', 'إظهار الإجابة الصحيحة بعد كل سؤال', s.instantFeedback) +
        switchRow('set-timer', 'تفعيل المؤقت', 'إيقاف تلقائي عند انتهاء الوقت', s.timerEnabled) +
        switchRow('set-remove-on-correct', 'إزالة السؤال من بنك الأخطاء عند الإجابة الصحيحة', 'يُبقي البنك مركّزاً على ما لم تتقنه', s.removeOnCorrect) +
        '<div class="row">' +
          '<div class="field" style="flex:1;min-width:160px"><label>ثوانٍ لكل سؤال</label><input type="number" id="setSecPerQ" min="10" max="300" value="' + s.secondsPerQuestion + '" /></div>' +
          '<div class="field" style="flex:1;min-width:160px"><label>درجة النجاح %</label><input type="number" id="setPass" min="1" max="100" value="' + s.passMark + '" /></div>' +
        '</div>' +
        '<button class="btn btn-soft" data-action="save-settings">حفظ الإعدادات</button>' +
      '</div>' +
    '</div>';

    html += '<div class="card"><div class="card-head"><h3 class="card-title">' + iconBook() + ' البيانات والنسخ الاحتياطي</h3></div>' +
      '<div class="stack">' +
        '<div class="summary-row"><span>الأسئلة الأساسية</span><b>' + DB.total + ' سؤال</b></div>' +
        '<div class="summary-row"><span>أسئلة بنك الأخطاء</span><b>' + Bank.size() + '</b></div>' +
        '<div class="summary-row"><span>المحاولات المسجلة</span><b>' + History.all().length + '</b></div>' +
        '<div class="summary-row"><span>مكان الحفظ</span><b>' + (Store.available ? 'متصفحك (محلي)' : 'ذاكرة مؤقتة') + '</b></div>' +
        '<div class="summary-div"></div>' +
        '<button class="btn btn-ghost" data-action="backup-all">تصدير نسخة احتياطية كاملة (JSON)</button>' +
        '<button class="btn btn-ghost" data-action="restore-all">استيراد نسخة احتياطية</button>' +
        '<div class="summary-div"></div>' +
        '<button class="btn btn-ghost" data-action="theme-toggle">تبديل الوضع الليلي / النهاري</button>' +
        '<button class="btn btn-danger" data-action="reset-settings">استعادة الإعدادات الافتراضية</button>' +
        '<button class="btn btn-danger" data-action="wipe-all">حذف كل البيانات (البنك والسجل والإعدادات)</button>' +
      '</div>' +
    '</div>';

    html += '</div>';

    html += '<div class="card" style="margin-top:18px"><div class="card-head"><h3 class="card-title">' + iconList() + ' اختصارات ومساعدة</h3></div>' +
      '<div class="stack">' +
        '<div class="small"><span class="kbd">1</span>…<span class="kbd">4</span> اختيار الإجابة أثناء الامتحان.</div>' +
        '<div class="small"><span class="kbd">←</span> السؤال التالي • <span class="kbd">→</span> السؤال السابق.</div>' +
        '<div class="small"><span class="kbd">F</span> تعليم السؤال للمراجعة • <span class="kbd">Enter</span> الانتقال للتالي.</div>' +
        '<div class="small muted">تلميح: يمكنك طبع صفحة النتيجة من المتصفح (Ctrl+P) للحصول على نسخة ورقية من أسئلتك الخاطئة والإجابات الصحيحة.</div>' +
      '</div>' +
    '</div>';

    $('#view-settings').innerHTML = html;
  }

  /* ============================================================
     استيراد / تصدير
     ============================================================ */
  function pickFile(accept, cb) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept || '.json,application/json';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => cb(String(reader.result));
      reader.readAsText(file, 'utf-8');
    };
    input.click();
  }

  function toCSV(rows) {
    return rows.map(r => r.map(cell => {
      const v = String(cell == null ? '' : cell).replace(/"/g, '""');
      return '"' + v + '"';
    }).join(',')).join('\r\n');
  }

  function exportWrongCSV(attempt) {
    const rows = [['#', 'المحور', 'السؤال', 'الإجابة الصحيحة', 'إجابتك']];
    attempt.questions.forEach((q, i) => {
      const answered = q.chosen !== null && q.chosen !== undefined;
      if (answered && q.chosen === q.answer) return;
      rows.push([
        i + 1,
        DB.stripChapterPrefix(q.chapter),
        q.q,
        q.options[q.answer],
        answered ? q.options[q.chosen] : 'بدون إجابة'
      ]);
    });
    download('الأسئلة-الخاطئة-' + new Date().toISOString().slice(0, 10) + '.csv', toCSV(rows), 'text/csv');
    toast('تم تصدير الأسئلة الخاطئة', 'ok');
  }

  /* ============================================================
     الأحداث
     ============================================================ */
  function bindEvents() {
    /* التنقل والثيم */
    $('#brandHome').addEventListener('click', e => { e.preventDefault(); showView('home'); });
    $('#navToggle').addEventListener('click', () => $('#mainNav').classList.toggle('open'));
    $('#themeToggle').addEventListener('click', toggleTheme);

    document.addEventListener('click', e => {
      const navBtn = e.target.closest('#mainNav .nav-btn');
      if (navBtn) { navigate(navBtn.dataset.nav); return; }

      const el = e.target.closest('[data-action]');
      if (!el) return;
      const action = el.dataset.action;

      switch (action) {
        /* عام */
        case 'nav': navigate(el.dataset.nav || 'home'); break;
        case 'start-all': openSetup('all'); break;
        case 'start-set': openSetup('set', el.dataset.set); break;
        case 'review-set': startReview(el.dataset.set); break;
        case 'quick-practice': beginExam(baseConfig({ source: 'all', count: 10, setTitle: 'تدريب سريع (10 أسئلة)' })); break;
        case 'start-bank': bankExam('all'); break;
        case 'resume': resumeAttempt(); break;
        case 'discard-active': ActiveAttempt.clear(); renderHome(); toast('تم حذف المحاولة غير المكتملة'); break;

        /* إعداد الامتحان */
        case 'pick-source': pickSource(el.dataset.source); break;
        case 'pick-count': pickCount(el.dataset.count); break;
        case 'apply-count': applyCustomCount(); break;
        case 'begin': beginFromSetup(); break;
        case 'focus-toggle': break;

        /* الامتحان */
        case 'choose': chooseOption(parseInt(el.dataset.opt, 10)); break;
        case 'prev': gotoQuestion(State.attempt.index - 1); break;
        case 'next': gotoQuestion(State.attempt.index + 1); break;
        case 'goto': gotoQuestion(parseInt(el.dataset.i, 10)); break;
        case 'flag': toggleFlag(); break;
        case 'finish': finishExam(false); break;
        case 'focus': document.body.classList.toggle('focus-mode'); break;

        /* النتيجة */
        case 'retry-same': retrySame(); break;
        case 'retry-wrong': retryWrong(); break;
        case 'filter': setResultFilter(el.dataset.filter); break;
        case 'expand-all': toggleExpandAll(); break;
        case 'print': window.print(); break;
        case 'export-wrong': if (State.lastAttempt) exportWrongCSV(State.lastAttempt); break;

        /* البنك */
        case 'bank-exam': bankExam('all'); break;
        case 'bank-exam-custom': bankExam('custom'); break;
        case 'bank-toggle': toggleBankItem(el.dataset.uid); break;
        case 'bank-remove': removeBankItem(el.dataset.uid); break;
        case 'bank-practice': practiceSingle(el.dataset.uid); break;
        case 'bank-export': exportBank(); break;
        case 'bank-import': importBank(); break;
        case 'bank-clear': clearBank(); break;

        /* السجل */
        case 'history-remove': removeHistory(el.dataset.id); break;
        case 'history-clear': clearHistory(); break;
        case 'history-export': exportHistory(); break;

        /* الإعدادات */
        case 'save-settings': saveSettings(); break;
        case 'theme-toggle': toggleTheme(); break;
        case 'reset-settings': resetSettings(); break;
        case 'backup-all': backupAll(); break;
        case 'restore-all': restoreAll(); break;
        case 'wipe-all': wipeAll(); break;
      }
    });

    /* تغييرات الإدخال */
    document.addEventListener('change', e => {
      const t = e.target;
      if (!t || !t.id) return;
      switch (t.id) {
        case 'setPicker':
          State.setup.setId = t.value; renderSetup(); break;
        case 'setup-shuffle-options': Settings.update({ shuffleOptions: t.checked }); renderSetup(); break;
        case 'setup-shuffle-questions': Settings.update({ shuffleQuestions: t.checked }); renderSetup(); break;
        case 'setup-instant': Settings.update({ instantFeedback: t.checked }); renderSetup(); break;
        case 'setup-timer': Settings.update({ timerEnabled: t.checked }); renderSetup(); break;
        case 'set-shuffle-options': Settings.update({ shuffleOptions: t.checked }); toast('تم تحديث الإعدادات'); break;
        case 'set-shuffle-questions': Settings.update({ shuffleQuestions: t.checked }); toast('تم تحديث الإعدادات'); break;
        case 'set-instant': Settings.update({ instantFeedback: t.checked }); toast('تم تحديث الإعدادات'); break;
        case 'set-timer': Settings.update({ timerEnabled: t.checked }); toast('تم تحديث الإعدادات'); break;
        case 'set-remove-on-correct': Settings.update({ removeOnCorrect: t.checked }); toast('تم تحديث الإعدادات'); break;
        case 'bankChapter': $('#bankList').innerHTML = bankListHtml(); break;
        case 'bankSort': $('#bankList').innerHTML = bankListHtml(); break;
      }
    });

    document.addEventListener('input', e => {
      if (e.target && e.target.id === 'bankSearch') {
        const list = $('#bankList');
        if (list) list.innerHTML = bankListHtml();
      }
    });

    /* لوحة المفاتيح */
    document.addEventListener('keydown', e => {
      if (State.view !== 'exam' || !State.attempt) return;
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      const a = State.attempt;
      if (/^[1-6]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        const q = a.questions[a.index];
        if (q && idx < q.options.length) { chooseOption(idx); e.preventDefault(); }
        return;
      }
      if (e.key === 'ArrowLeft') { gotoQuestion(a.index + 1); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { gotoQuestion(a.index - 1); e.preventDefault(); }
      else if (e.key === 'Enter') { gotoQuestion(a.index + 1); e.preventDefault(); }
      else if (e.key === 'f' || e.key === 'F') { toggleFlag(); e.preventDefault(); }
    });
  }

  /* ---------------- منطق مساعد للأحداث ---------------- */
  function navigate(name) {
    if (State.attempt && name !== 'exam') {
      stopTimer();
    }
    if (name === 'home') { renderHome(); showView('home'); }
    else if (name === 'bank') { renderBank(); showView('bank'); }
    else if (name === 'history') { renderHistory(); showView('history'); }
    else if (name === 'settings') { renderSettings(); showView('settings'); }
    else if (name === 'exam') {
      if (State.attempt) { renderExam(); showView('exam'); startTimer(); }
      else showView('home');
    }
    else showView(name);
  }

  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', cur);
    Settings.update({ theme: cur });
  }

  function baseConfig(extra) {
    const s = Settings.all();
    return Object.assign({
      source: 'all',
      shuffleQuestions: s.shuffleQuestions,
      shuffleOptions: s.shuffleOptions,
      timerEnabled: s.timerEnabled,
      secondsPerQuestion: s.secondsPerQuestion,
      instantFeedback: s.instantFeedback
    }, extra || {});
  }

  function pickSource(source) {
    if (source === 'bank' && Bank.size() === 0) { toast('بنك الأخطاء فارغ حالياً', 'err'); return; }
    State.setup.source = source;
    if (source === 'set' && !State.setup.setId && DB.sets.length) {
      State.setup.setId = DB.bigSets.length ? DB.bigSets[0].id : DB.sets[0].id;
    }
    if (source === 'all' && DB.total > 100) State.setup.count = 100;
    if (source === 'bank') State.setup.count = 'all';
    renderSetup();
  }
  function pickCount(value) {
    State.setup.count = value === 'all' ? 'all' : parseInt(value, 10);
    renderSetup();
  }
  function applyCustomCount() {
    const input = $('#customCount');
    const pool = setupPool();
    let n = parseInt(input.value, 10);
    if (isNaN(n) || n < 1) n = 1;
    if (n > pool) n = pool;
    if (n === pool) State.setup.count = 'all';
    else State.setup.count = n;
    if (State.setup.count === 'all') toast('تم اختيار جميع الأسئلة المتاحة (' + pool + ')', 'ok');
    else toast('تم تحديد ' + n + ' سؤال', 'ok');
    renderSetup();
  }
  function beginFromSetup() {
    const cfg = State.setup;
    beginExam(baseConfig({
      source: cfg.source,
      setId: cfg.setId,
      count: cfg.count,
      setTitle: setupTitle()
    }));
  }

  function chooseOption(idx) {
    const a = State.attempt;
    if (!a) return;
    Quiz.choose(a, idx);
    renderQuestionArea();
    renderExamSide();
    updateExamTop();
    ActiveAttempt.save(a);
    if (a.instantFeedback) {
      const q = a.questions[a.index];
      if (q.checked && q.chosen === q.answer) toast('إجابة صحيحة ✔', 'ok');
    }
  }
  function gotoQuestion(i) {
    const a = State.attempt;
    if (!a) return;
    if (i < 0 || i >= a.questions.length) return;
    a.index = i;
    renderQuestionArea();
    renderExamSide();
    updateExamTop();
    ActiveAttempt.save(a);
    const card = $('#qArea');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function toggleFlag() {
    const a = State.attempt;
    if (!a) return;
    const q = a.questions[a.index];
    q.flagged = !q.flagged;
    renderQuestionArea();
    renderExamSide();
    ActiveAttempt.save(a);
  }

  function setResultFilter(f) {
    State.resultFilter = f;
    renderResult(State.lastAttempt);
  }
  function toggleExpandAll() {
    const list = $('#reviewList');
    if (!list) return;
    $$('.review-opts', list).forEach(o => { o.style.display = o.style.display === 'none' ? '' : 'none'; });
  }

  function retrySame() {
    const a = State.lastAttempt;
    if (!a) return;
    const questions = a.questions.map(q => ({
      uid: q.uid, setId: q.setId, chapter: q.chapter, q: q.q,
      options: q.sourceOptions.slice(), answer: q.sourceAnswer
    }));
    const s = Settings.all();
    beginExam(baseConfig({
      source: 'custom', questions: questions, count: 'all',
      setTitle: a.title, setId: a.setId
    }));
  }
  function retryWrong() {
    const a = State.lastAttempt;
    if (!a) return;
    const wrong = a.questions.filter(q => q.chosen !== null && q.chosen !== undefined && q.chosen !== q.answer)
      .map(q => ({ uid: q.uid, setId: q.setId, chapter: q.chapter, q: q.q, options: q.sourceOptions.slice(), answer: q.sourceAnswer }));
    if (!wrong.length) { toast('لا توجد أسئلة خاطئة في هذه المحاولة', 'err'); return; }
    beginExam(baseConfig({ source: 'custom', questions: wrong, count: 'all', setTitle: 'امتحان أسئلة أخطأت فيها' }));
  }

  function startReview(setId) {
    const s = DB.sets.find(x => x.id === setId);
    if (!s) return;
    toast('وضع المراجعة: تصحيح فوري بعد كل سؤال');
    beginExam(baseConfig({
      source: 'set',
      setId: setId,
      count: 'all',
      setTitle: s.title + ' — مراجعة',
      instantFeedback: true,
      timerEnabled: false,
      shuffleQuestions: false,
      shuffleOptions: true
    }));
  }

  function resumeAttempt() {    const a = ActiveAttempt.load();
    if (!a) return;
    startAttempt(a);
    toast('تم استئناف الامتحان');
  }

  /* ---------------- بنك الأخطاء ---------------- */
  function bankExam(mode) {
    const n = Bank.size();
    if (!n) { toast('بنك الأخطاء فارغ حالياً', 'err'); return; }
    if (mode === 'custom') {
      Modal.open(
        '<h3>عدد أسئلة امتحان الأخطاء</h3>' +
        '<p>لديك <b>' + n + '</b> سؤالاً في بنك الأخطاء.</p>' +
        '<div class="field"><label>عدد الأسئلة</label><input type="number" id="mBankCount" min="1" max="' + n + '" value="' + Math.min(n, 25) + '" /></div>' +
        '<div class="modal-actions" style="margin-top:16px">' +
        '<button class="btn btn-ghost" data-m="cancel">إلغاء</button>' +
        '<button class="btn btn-primary" data-m="ok">ابدأ</button></div>',
        b => {
          b.querySelector('[data-m="cancel"]').onclick = Modal.close;
          b.querySelector('[data-m="ok"]').onclick = () => {
            const v = Math.max(1, Math.min(n, parseInt(b.querySelector('#mBankCount').value, 10) || n));
            Modal.close();
            beginExam(baseConfig({ source: 'bank', count: v, setTitle: 'امتحان بنك الأخطاء (' + v + ' سؤال)' }));
          };
        }
      );
      return;
    }
    beginExam(baseConfig({ source: 'bank', count: 'all', setTitle: 'امتحان بنك الأخطاء (' + n + ' سؤال)' }));
  }
  function toggleBankItem(uid) {
    State.reviewExpanded[uid] = !State.reviewExpanded[uid];
    const list = $('#bankList');
    if (list) list.innerHTML = bankListHtml();
  }
  function removeBankItem(uid) {
    Bank.remove(uid);
    refreshBadges();
    renderBank();
    toast('تمت إزالة السؤال من بنك الأخطاء');
  }
  function practiceSingle(uid) {
    const item = Bank.find(uid);
    if (!item) return;
    const q = Bank.resolve(item);
    beginExam(baseConfig({ source: 'custom', questions: [q], count: 'all', setTitle: 'تدريب على سؤال واحد' }));
  }
  async function clearBank() {
    if (!Bank.size()) return;
    const ok = await Modal.confirm({
      title: 'تفريغ بنك الأخطاء؟',
      body: 'سيتم حذف <b>' + Bank.size() + '</b> سؤالاً من البنك نهائياً. لا يمكن التراجع.',
      okText: 'تفريغ البنك', danger: true
    });
    if (!ok) return;
    Bank.clear(); refreshBadges(); renderBank(); toast('تم تفريغ بنك الأخطاء', 'ok');
  }
  function exportBank() {
    if (!Bank.size()) { toast('البنك فارغ', 'err'); return; }
    download('بنك-الأخطاء-' + new Date().toISOString().slice(0, 10) + '.json', Bank.exportJSON(), 'application/json');
    toast('تم تصدير بنك الأخطاء', 'ok');
  }
  function importBank() {
    pickFile('.json,application/json', text => {
      try {
        const n = Bank.importJSON(text, true);
        refreshBadges(); renderBank();
        toast('تمت الاستيراد — البنك يحتوي الآن على ' + n + ' سؤال', 'ok');
      } catch (err) {
        toast('تعذّر قراءة الملف: ' + err.message, 'err');
      }
    });
  }

  /* ---------------- السجل ---------------- */
  function removeHistory(id) {
    History.remove(id);
    renderHistory(); renderHome();
    toast('تم حذف المحاولة');
  }
  async function clearHistory() {
    if (!History.all().length) return;
    const ok = await Modal.confirm({ title: 'مسح سجل النتائج؟', body: 'سيتم حذف جميع المحاولات المسجلة.', okText: 'مسح السجل', danger: true });
    if (!ok) return;
    History.clear(); renderHistory(); renderHome(); toast('تم مسح السجل', 'ok');
  }
  function exportHistory() {
    const rows = [['التاريخ', 'الامتحان', 'عدد الأسئلة', 'صحيح', 'خطأ', 'بدون إجابة', 'النسبة %', 'الناجح', 'المدة (ث)']];
    History.all().forEach(a => rows.push([
      fmtDate(a.ts), a.title, a.total, a.correct, a.wrong, a.skipped, a.scorePercent, a.passed ? 'ناجح' : 'غير ناجح', a.durationSec
    ]));
    download('سجل-النتائج-' + new Date().toISOString().slice(0, 10) + '.csv', toCSV(rows), 'text/csv');
    toast('تم تصدير السجل', 'ok');
  }

  /* ---------------- الإعدادات ---------------- */
  function saveSettings() {
    const sec = parseInt(($('#setSecPerQ') || {}).value, 10);
    const pass = parseInt(($('#setPass') || {}).value, 10);
    Settings.update({
      secondsPerQuestion: (isNaN(sec) ? Settings.all().secondsPerQuestion : Math.max(10, Math.min(300, sec))),
      passMark: (isNaN(pass) ? Settings.all().passMark : Math.max(1, Math.min(100, pass)))
    });
    renderSettings();
    toast('تم حفظ الإعدادات', 'ok');
  }
  async function resetSettings() {
    const ok = await Modal.confirm({ title: 'استعادة الإعدادات الافتراضية؟', body: 'سيتم إرجاع إعدادات الامتحان إلى القيم الأصلية.', okText: 'استعادة' });
    if (!ok) return;
    Settings.reset();
    applyTheme();
    renderSettings();
    toast('تمت استعادة الإعدادات الافتراضية', 'ok');
  }
  function backupAll() {
    const payload = {
      type: 'apb-backup', version: 1, exportedAt: new Date().toISOString(),
      settings: Settings.all(), wrongBank: Bank.all(), history: History.all()
    };
    download('نسخة-احتياطية-الامتحان-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(payload, null, 2), 'application/json');
    toast('تم تصدير النسخة الاحتياطية', 'ok');
  }
  function restoreAll() {
    pickFile('.json,application/json', text => {
      try {
        const data = JSON.parse(text);
        if (data.settings) Settings.update(data.settings);
        if (Array.isArray(data.wrongBank)) {
          Bank.clear();
          Bank.importJSON(JSON.stringify({ items: data.wrongBank }), true);
        }
        if (Array.isArray(data.history)) {
          History.clear();
          data.history.slice().reverse().forEach(h => History.add(h));
        }
        applyTheme(); refreshBadges(); renderSettings();
        toast('تمت استعادة النسخة الاحتياطية', 'ok');
      } catch (err) {
        toast('ملف غير صالح: ' + err.message, 'err');
      }
    });
  }
  async function wipeAll() {
    const ok = await Modal.confirm({
      title: 'حذف كل البيانات؟',
      body: 'سيتم حذف بنك الأخطاء وسجل النتائج والإعدادات نهائياً.',
      okText: 'حذف الكل', danger: true
    });
    if (!ok) return;
    Bank.clear(); History.clear(); Settings.reset(); ActiveAttempt.clear();
    applyTheme(); refreshBadges(); renderSettings(); renderHome();
    toast('تم حذف كل البيانات', 'ok');
  }

  /* ---------------- الثيم ---------------- */
  function applyTheme() {
    const t = Settings.all().theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
  }

  /* ============================================================
     التهيئة
     ============================================================ */
  function init() {
    applyTheme();
    if (!Store.available) $('#storageWarning').hidden = false;
    $('#footerCount').textContent = DB.total;
    refreshBadges();
    bindEvents();
    renderHome();
    showView('home');

    // استئناف تلقائي عند وجود محاولة جارية
    const active = ActiveAttempt.load();
    if (active && active.questions && active.questions.length) {
      // إبقاء العرض على الرئيسية مع زر الاستئناف
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.AppDebug = { State, DB, Bank, History, Settings, Quiz, Store };
})();
