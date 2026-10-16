/* ============================================================
   store.js — طبقة البيانات: القراءة/الحفظ، بنك الأخطاء، السجل
   ============================================================ */
'use strict';

/* ---------- آمن للتخزين المحلي ---------- */
const Store = (() => {
  const PREFIX = 'apb.exam.v1.';
  const memory = {};
  let available = true;
  try {
    const t = PREFIX + '__test';
    window.localStorage.setItem(t, 'ok');
    available = window.localStorage.getItem(t) === 'ok';
    window.localStorage.removeItem(t);
  } catch (e) {
    available = false;
  }

  function getRaw(key) {
    if (available) {
      try { return window.localStorage.getItem(PREFIX + key); } catch (e) { /* fall through */ }
    }
    return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
  }
  function setRaw(key, value) {
    memory[key] = value;
    if (available) {
      try { window.localStorage.setItem(PREFIX + key, value); } catch (e) { available = false; }
    }
  }
  function get(key, fallback) {
    const raw = getRaw(key);
    if (raw === null || raw === undefined) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }
  function set(key, value) {
    try { setRaw(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }
  function del(key) {
    delete memory[key];
    if (available) { try { window.localStorage.removeItem(PREFIX + key); } catch (e) {} }
  }
  function keys() {
    if (!available) return Object.keys(memory);
    const out = [];
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) out.push(k.slice(PREFIX.length));
      }
    } catch (e) {}
    return out;
  }
  return { available, get, set, del, keys };
})();

/* ---------- قاعدة الأسئلة ---------- */
const DB = (() => {
  const raw = (window.EXAM_DATA && Array.isArray(window.EXAM_DATA.sets)) ? window.EXAM_DATA : { sets: [] };
  const sets = [];
  const all = [];
  const byUid = new Map();

  const BIG_THRESHOLD = 50;
  const ORDINALS = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر',
    'الحادي عشر', 'الثاني عشر', 'الثالث عشر', 'الرابع عشر', 'الخامس عشر'];

  let bigIndex = 0;
  raw.sets.forEach((set, si) => {
    const questions = (set.questions || []).map((q, qi) => {
      const options = Array.isArray(q.options) ? q.options.slice() : [];
      const answer = (typeof q.answer === 'number' && q.answer >= 0 && q.answer < options.length) ? q.answer : 0;
      return {
        uid: set.id + ':' + qi,
        setId: set.id,
        setIndex: si,
        indexInSet: qi,
        chapter: q.chapter || '',
        q: q.q || '',
        options: options,
        answer: answer
      };
    });

    const isBig = questions.length >= BIG_THRESHOLD;
    if (isBig) bigIndex += 1;

    const meta = {
      id: set.id,
      index: si,
      order: bigIndex,
      isBig: isBig,
      size: questions.length,
      chapters: Array.isArray(set.chapters) ? set.chapters.slice() : [],
      questions: questions,
      title: isBig ? ('الامتحان الشامل ' + (ORDINALS[bigIndex - 1] || ('رقم ' + bigIndex))) : 'مجموعة مختصرة',
      subtitle: ''
    };

    meta.subtitle = meta.chapters.length
      ? meta.chapters.map(function (c) { return stripChapterPrefix(c); }).join(' • ')
      : (questions.length + ' سؤال');

    meta.badge = isBig ? String(bigIndex) : '✚';
    sets.push(meta);
  });

  sets.forEach(s => s.questions.forEach(q => { all.push(q); byUid.set(q.uid, q); }));

  function stripChapterPrefix(c) {
    // "المحور الأول: كذا"  ->  "كذا"
    const idx = c.indexOf(':');
    if (idx > -1 && idx < 22) return c.slice(idx + 1).trim();
    return c;
  }

  return {
    sets: sets,
    all: all,
    byUid: byUid,
    total: all.length,
    bigSets: sets.filter(s => s.isBig),
    smallSets: sets.filter(s => !s.isBig),
    stripChapterPrefix: stripChapterPrefix,
    get: function (uid) { return byUid.get(uid) || null; },
    ordinals: ORDINALS
  };
})();
window.DB = DB;

/* ---------- الإعدادات ---------- */
const Settings = (() => {
  const DEFAULTS = {
    shuffleOptions: true,
    shuffleQuestions: true,
    timerEnabled: true,
    secondsPerQuestion: 45,
    instantFeedback: false,
    removeOnCorrect: true,
    passMark: 60,
    theme: 'light'
  };
  let current = Object.assign({}, DEFAULTS, Store.get('settings', {}));

  function save() { Store.set('settings', current); }
  function all() { return current; }
  function update(patch) { Object.assign(current, patch); save(); return current; }
  function reset() { current = Object.assign({}, DEFAULTS); save(); return current; }
  return { all, update, reset, DEFAULTS };
})();

/* ---------- بنك الأخطاء ---------- */
const Bank = (() => {
  let items = Store.get('wrongBank', []);

  function persist() { Store.set('wrongBank', items); }
  function all() { return items; }
  function size() { return items.length; }
  function find(uid) { return items.find(i => i.uid === uid) || null; }

  function snapshot(q) {
    return {
      uid: q.uid,
      setId: q.setId,
      chapter: q.chapter || '',
      q: q.q,
      options: q.options.slice(),
      answer: q.answer
    };
  }

  function snapshotFromBankItem(item) {
    return { uid: item.uid, setId: item.setId, chapter: item.chapter, q: item.q, options: item.options, answer: item.answer };
  }

  function addWrong(q) {
    const existing = find(q.uid);
    if (existing) {
      existing.wrongCount = (existing.wrongCount || 1) + 1;
      existing.lastAt = Date.now();
      existing.streak = 0;
    } else {
      const snap = snapshot(q);
      snap.wrongCount = 1;
      snap.streak = 0;
      snap.addedAt = Date.now();
      snap.lastAt = Date.now();
      items.push(snap);
    }
    persist();
  }

  function markCorrect(uid) {
    const existing = find(uid);
    if (!existing) return;
    existing.streak = (existing.streak || 0) + 1;
    existing.lastAt = Date.now();
    if (Settings.all().removeOnCorrect && existing.streak >= 1) {
      remove(uid);
      return 'removed';
    }
    persist();
    return 'kept';
  }

  function remove(uid) {
    items = items.filter(i => i.uid !== uid);
    persist();
  }
  function clear() { items = []; persist(); }

  function resolve(item) {
    const live = DB.get(item.uid);
    if (live) {
      return { uid: live.uid, setId: live.setId, chapter: live.chapter, q: live.q, options: live.options.slice(), answer: live.answer };
    }
    return snapshotFromBankItem(item);
  }

  function asQuestions() { return items.map(resolve); }

  function stats() {
    const byChapter = new Map();
    let repeated = 0;
    items.forEach(i => {
      const c = i.chapter || 'بدون محور';
      byChapter.set(c, (byChapter.get(c) || 0) + 1);
      if ((i.wrongCount || 1) > 1) repeated += 1;
    });
    return { total: items.length, repeated: repeated, byChapter: byChapter };
  }

  function exportJSON() {
    return JSON.stringify({ type: 'apb-wrong-bank', version: 1, exportedAt: new Date().toISOString(), items: items }, null, 2);
  }
  function importJSON(text, merge) {
    const data = JSON.parse(text);
    const incoming = Array.isArray(data) ? data : (data && data.items);
    if (!Array.isArray(incoming)) throw new Error('ملف غير صالح');
    if (!merge) items = [];
    incoming.forEach(inc => {
      if (!inc || !inc.uid || !inc.q) return;
      const existing = find(inc.uid);
      if (existing) {
        existing.wrongCount = Math.max(existing.wrongCount || 1, inc.wrongCount || 1);
        existing.lastAt = Math.max(existing.lastAt || 0, inc.lastAt || 0);
      } else {
        items.push({
          uid: inc.uid, setId: inc.setId || '', chapter: inc.chapter || '', q: inc.q,
          options: Array.isArray(inc.options) ? inc.options.slice() : [], answer: typeof inc.answer === 'number' ? inc.answer : 0,
          wrongCount: inc.wrongCount || 1, streak: inc.streak || 0,
          addedAt: inc.addedAt || Date.now(), lastAt: inc.lastAt || Date.now()
        });
      }
    });
    persist();
    return items.length;
  }

  return {
    all, size, find, addWrong, markCorrect, remove, clear, resolve, asQuestions, stats,
    exportJSON, importJSON, has: function (uid) { return !!find(uid); }
  };
})();

/* ---------- سجل المحاولات ---------- */
const History = (() => {
  const MAX = 60;
  let items = Store.get('history', []);

  function persist() { Store.set('history', items); }
  function all() { return items; }
  function add(record) {
    items.unshift(record);
    if (items.length > MAX) items = items.slice(0, MAX);
    persist();
    return record;
  }
  function remove(id) {
    items = items.filter(i => i.id !== id);
    persist();
  }
  function clear() { items = []; persist(); }
  function best() {
    if (!items.length) return null;
    return items.reduce((a, b) => (b.scorePercent > a.scorePercent ? b : a));
  }
  function average() {
    if (!items.length) return 0;
    const sum = items.reduce((a, b) => a + (b.scorePercent || 0), 0);
    return sum / items.length;
  }
  function last(n) { return items.slice(0, n || 10); }
  return { all, add, remove, clear, best, average, last };
})();

/* ---------- المحاولة الجارية (لاستكمال الامتحان) ---------- */
const ActiveAttempt = (() => {
  function save(attempt) { Store.set('activeAttempt', attempt); }
  function load() { return Store.get('activeAttempt', null); }
  function clear() { Store.del('activeAttempt'); }
  return { save, load, clear };
})();
