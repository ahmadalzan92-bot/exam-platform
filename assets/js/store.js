/* ============================================================
   store.js — طبقة البيانات: القراءة/الحفظ، بنك الأخطاء، السجل
   ============================================================ */
'use strict';

/* ============================================================
   التخزين المحلي — بنطاق منفصل لكل مستخدم
   المفاتيح العامة (المستخدمون/الجلسة): apb.exam.v1.global.*
   المفاتيح الخاصة بالمستخدم:            apb.exam.v1.u.<id>.*
   ============================================================ */
const Store = (() => {
  const BASE = 'apb.exam.v1.';
  const GLOBAL_BASE = BASE + 'global.';
  const memory = {};
  let available = true;
  let uid = null;

  try {
    const t = BASE + '__test';
    window.localStorage.setItem(t, 'ok');
    available = window.localStorage.getItem(t) === 'ok';
    window.localStorage.removeItem(t);
  } catch (e) {
    available = false;
  }

  function fullKey(key) { return BASE + 'u.' + (uid || '_guest') + '.' + key; }
  function globalFullKey(key) { return GLOBAL_BASE + key; }
  function userPrefix(userId) { return BASE + 'u.' + userId + '.'; }

  function readFull(fk) {
    if (available) {
      try {
        const v = window.localStorage.getItem(fk);
        if (v !== null && v !== undefined) return v;
      } catch (e) { /* fall through */ }
    }
    return Object.prototype.hasOwnProperty.call(memory, fk) ? memory[fk] : null;
  }
  function writeFull(fk, value) {
    memory[fk] = value;
    if (available) {
      try { window.localStorage.setItem(fk, value); } catch (e) { available = false; }
    }
  }
  function removeFull(fk) {
    delete memory[fk];
    if (available) { try { window.localStorage.removeItem(fk); } catch (e) {} }
  }

  function decode(raw, fallback) {
    if (raw === null || raw === undefined) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  /* ---- بيانات المستخدم الحالي ---- */
  function get(key, fallback) { return decode(readFull(fullKey(key)), fallback); }
  function set(key, value) {
    try { writeFull(fullKey(key), JSON.stringify(value)); } catch (e) { /* ignore */ }
  }
  function del(key) { removeFull(fullKey(key)); }

  /* ---- بيانات عامة (المستخدمون والجلسة) ---- */
  function getGlobal(key, fallback) { return decode(readFull(globalFullKey(key)), fallback); }
  function setGlobal(key, value) {
    try { writeFull(globalFullKey(key), JSON.stringify(value)); } catch (e) { /* ignore */ }
  }
  function delGlobal(key) { removeFull(globalFullKey(key)); }

  /* ---- تغيير نطاق المستخدم ---- */
  function setUser(id) { uid = id || null; }
  function getUserId() { return uid; }

  /* ---- نقل بيانات الإصدار السابق (قبل وجود الحسابات) ---- */
  function migrateLegacy(userId) {
    const LEGACY = ['settings', 'wrongBank', 'history', 'activeAttempt'];
    let moved = 0;
    LEGACY.forEach(k => {
      const legacyKey = BASE + k;
      let raw = null;
      if (available) { try { raw = window.localStorage.getItem(legacyKey); } catch (e) {} }
      if (raw === null || raw === undefined) return;
      writeFull(BASE + 'u.' + userId + '.' + k, raw);
      if (available) { try { window.localStorage.removeItem(legacyKey); } catch (e) {} }
      moved++;
    });
    return moved;
  }

  /* ---- حذف كل بيانات مستخدم ---- */
  function dropUserData(userId) {
    const pre = userPrefix(userId);
    Object.keys(memory).forEach(k => { if (k.indexOf(pre) === 0) delete memory[k]; });
    if (!available) return;
    try {
      const doomed = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.indexOf(pre) === 0) doomed.push(k);
      }
      doomed.forEach(k => { try { window.localStorage.removeItem(k); } catch (e) {} });
    } catch (e) {}
  }

  function keys() {
    const pre = fullKey('');
    if (!available) return Object.keys(memory).filter(k => k.indexOf(pre) === 0);
    const out = [];
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.indexOf(pre) === 0) out.push(k.slice(pre.length));
      }
    } catch (e) {}
    return out;
  }

  return {
    available: available, get, set, del, keys,
    getGlobal, setGlobal, delGlobal,
    setUser, getUserId, migrateLegacy, dropUserData
  };
})();

/* ============================================================
   المستخدمون — حساب محلي لكل شخص ونتائجه منفصلة تماماً
   ============================================================ */
const Users = (() => {
  const KEY = 'users';
  let list = Store.getGlobal(KEY, null);
  if (!Array.isArray(list)) list = [];

  function persist() { Store.setGlobal(KEY, list); }
  function all() { return list.slice(); }
  function count() { return list.length; }
  function find(id) { return list.find(u => u.id === id) || null; }
  function findByName(name) {
    const n = String(name == null ? '' : name).trim();
    return list.find(u => u.name === n) || null;
  }
  function hasPin(user) { return !!(user && user.pin); }

  /* تجزئة بسيطة للرمز — مناسبة لحماية رمز دخول محلي على نفس الجهاز */
  function hashPin(pin, salt) {
    const text = 'apb|' + salt + '|' + pin;
    let h1 = 0x811c9dc5, h2 = 0x1000193;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      h1 = ((h1 ^ c) * 16777619) >>> 0;
      h2 = (((h2 * 31) >>> 0) + c) >>> 0;
    }
    return h1.toString(36) + '-' + h2.toString(36);
  }
  function makeSalt() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

  function create(name, pin) {
    const clean = String(name == null ? '' : name).trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!clean) return { error: 'يرجى إدخال الاسم' };
    if (findByName(clean)) return { error: 'يوجد مستخدم بهذا الاسم بالفعل' };
    if (pin && String(pin).length < 3) return { error: 'رمز الدخول يجب أن يكون 3 خانات على الأقل' };
    const id = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const salt = makeSalt();
    const user = {
      id, name: clean, salt,
      pin: pin ? hashPin(pin, salt) : '',
      createdAt: Date.now(), lastSeen: Date.now()
    };
    const first = list.length === 0;
    list.push(user);
    persist();
    if (first) Store.migrateLegacy(id);
    return { user };
  }

  function verify(user, pin) {
    if (!hasPin(user)) return true;
    return hashPin(pin, user.salt) === user.pin;
  }
  function setPin(id, pin) {
    const u = find(id);
    if (!u) return;
    u.salt = makeSalt();
    u.pin = pin ? hashPin(pin, u.salt) : '';
    persist();
  }
  function rename(id, name) {
    const u = find(id);
    const clean = String(name == null ? '' : name).trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!u || !clean) return;
    const clash = findByName(clean);
    if (clash && clash.id !== id) return;
    u.name = clean;
    persist();
  }
  function touch(id) {
    const u = find(id);
    if (!u) return;
    u.lastSeen = Date.now();
    persist();
  }
  function remove(id) {
    list = list.filter(u => u.id !== id);
    persist();
    Store.dropUserData(id);
  }
  function stats(id) {
    const pre = 'apb.exam.v1.u.' + id + '.';
    let attempts = 0;
    if (Store.available) {
      try {
        const raw = window.localStorage.getItem(pre + 'history');
        const arr = raw ? JSON.parse(raw) : [];
        if (Array.isArray(arr)) attempts = arr.length;
      } catch (e) {}
    }
    return { attempts };
  }

  return { all, count, find, findByName, create, verify, hasPin, setPin, rename, touch, remove, stats };
})();

/* ============================================================
   الجلسة — من هو المستخدم الحالي
   ============================================================ */
const Session = (() => {
  const KEY = 'currentUserId';
  let id = Store.getGlobal(KEY, null);
  if (id && !Users.find(id)) id = null;

  function current() { return id ? Users.find(id) : null; }
  function idOf() { return id; }
  function login(userId) {
    id = userId;
    Store.setGlobal(KEY, userId);
    Users.touch(userId);
    Store.setUser(userId);
  }
  function logout() {
    id = null;
    Store.setGlobal(KEY, null);
    Store.setUser(null);
  }
  return { current, id: idOf, login, logout };
})();

/* نطاق البيانات يُضبط قبل تهيئة الوحدات أدناه */
Store.setUser(Session.id());

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
