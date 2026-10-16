/* ============================================================
   quiz.js — بناء الامتحان، خلط الخيارات، التصحيح
   ============================================================ */
'use strict';

const Quiz = (() => {

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function uid() {
    return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function poolFor(source, opt) {
    opt = opt || {};
    if (source === 'set') {
      const set = DB.sets.find(s => s.id === opt.setId);
      return set ? set.questions.slice() : [];
    }
    if (source === 'bank') return Bank.asQuestions();
    if (source === 'custom') return (opt.questions || []).slice();
    return DB.all.slice(); // 'all'
  }

  /**
   * بناء محاولة امتحان جديدة
   * config: { source, setId, setTitle, count, shuffleQuestions, shuffleOptions,
   *           timerEnabled, secondsPerQuestion, instantFeedback, questions? }
   */
  function build(config) {
    const cfg = Object.assign({
      source: 'all', setId: null, setTitle: '', count: 'all',
      shuffleQuestions: true, shuffleOptions: true,
      timerEnabled: false, secondsPerQuestion: 45, instantFeedback: false
    }, config || {});

    let pool = poolFor(cfg.source, cfg);
    if (!pool.length) return null;

    let chosen;
    if (cfg.count === 'all' || cfg.count >= pool.length) {
      chosen = cfg.shuffleQuestions ? shuffle(pool) : pool.slice();
    } else {
      const n = Math.max(1, parseInt(cfg.count, 10) || 1);
      chosen = shuffle(pool).slice(0, n);
    }

    const questions = chosen.map(item => {
      const base = {
        uid: item.uid,
        setId: item.setId,
        chapter: item.chapter || '',
        q: item.q,
        sourceAnswer: item.answer,
        sourceOptions: item.options.slice(),
        chosen: null,
        flagged: false,
        checked: false
      };
      if (cfg.shuffleOptions) {
        const indexed = item.options.map((text, i) => ({ text: text, correct: i === item.answer }));
        const mixed = shuffle(indexed);
        base.options = mixed.map(o => o.text);
        base.answer = mixed.findIndex(o => o.correct);
      } else {
        base.options = item.options.slice();
        base.answer = item.answer;
      }
      if (base.answer < 0) base.answer = 0;
      return base;
    });

    const now = Date.now();
    const totalSec = cfg.timerEnabled ? Math.max(60, cfg.secondsPerQuestion * questions.length) : null;

    return {
      id: uid(),
      mode: cfg.source,
      setId: cfg.setId || null,
      title: cfg.setTitle || titleFor(cfg.source, cfg.setId),
      subtitle: subtitleFor(cfg.source, cfg.setId, questions.length),
      createdAt: now,
      startedAt: now,
      endsAt: totalSec ? now + totalSec * 1000 : null,
      timerEnabled: !!cfg.timerEnabled,
      totalSeconds: totalSec,
      instantFeedback: !!cfg.instantFeedback,
      shuffleOptions: !!cfg.shuffleOptions,
      questions: questions,
      index: 0,
      finished: false
    };
  }

  function titleFor(source, setId) {
    if (source === 'bank') return 'امتحان بنك الأخطاء';
    if (source === 'custom') return 'امتحان أسئلة خاطئة';
    if (source === 'set') {
      const s = DB.sets.find(x => x.id === setId);
      return s ? s.title : 'امتحان';
    }
    return 'امتحان شامل عشوائي';
  }
  function subtitleFor(source, setId, n) {
    if (source === 'bank') return n + ' سؤال من أسئلتك الخاطئة';
    if (source === 'custom') return n + ' سؤال اختير من أخطاء هذه المحاولة';
    if (source === 'set') {
      const s = DB.sets.find(x => x.id === setId);
      return s ? (s.size + ' سؤال • ' + s.chapters.length + ' محاور') : '';
    }
    return n + ' سؤال من كامل بنك الأسئلة';
  }

  /** اختيار الإجابة */
  function choose(attempt, optionIndex) {
    const q = attempt.questions[attempt.index];
    if (!q) return;
    if (attempt.instantFeedback && q.checked) return;
    q.chosen = optionIndex;
    if (attempt.instantFeedback) q.checked = true;
  }

  /** التصحيح الكامل + تحديث بنك الأخطاء والسجل */
  function grade(attempt) {
    let correct = 0, wrong = 0, skipped = 0;
    const chapterStats = new Map();
    const wrongList = [];

    attempt.questions.forEach(q => {
      const cName = q.chapter || 'بدون محور';
      if (!chapterStats.has(cName)) chapterStats.set(cName, { total: 0, correct: 0 });
      const cs = chapterStats.get(cName);
      cs.total += 1;

      if (q.chosen === null || q.chosen === undefined) {
        skipped += 1;
      } else if (q.chosen === q.answer) {
        correct += 1;
        cs.correct += 1;
        Bank.markCorrect(q.uid);
      } else {
        wrong += 1;
        wrongList.push(q);
        Bank.addWrong(q);
      }
    });

    const total = attempt.questions.length;
    const percent = total ? Math.round((correct / total) * 1000) / 10 : 0;
    const passMark = Settings.all().passMark;
    const passed = percent >= passMark;
    const durationSec = Math.round((Date.now() - attempt.startedAt) / 1000);

    attempt.finished = true;
    attempt.finishedAt = Date.now();
    attempt.result = {
      total: total,
      correct: correct,
      wrong: wrong,
      skipped: skipped,
      percent: percent,
      passed: passed,
      passMark: passMark,
      durationSec: durationSec,
      chapters: Array.from(chapterStats.entries()).map(([name, v]) => ({
        name: name, total: v.total, correct: v.correct,
        percent: v.total ? Math.round((v.correct / v.total) * 1000) / 10 : 0
      })),
      wrongUids: wrongList.map(q => q.uid)
    };

    History.add({
      id: attempt.id,
      ts: attempt.finishedAt,
      title: attempt.title,
      subtitle: attempt.subtitle,
      mode: attempt.mode,
      setId: attempt.setId,
      total: total,
      correct: correct,
      wrong: wrong,
      skipped: skipped,
      scorePercent: percent,
      passed: passed,
      durationSec: durationSec
    });

    return attempt.result;
  }

  /** إحصاءات مباشرة أثناء الامتحان */
  function liveStats(attempt) {
    let answered = 0, flagged = 0;
    attempt.questions.forEach(q => {
      if (q.chosen !== null && q.chosen !== undefined) answered += 1;
      if (q.flagged) flagged += 1;
    });
    return { answered: answered, flagged: flagged, total: attempt.questions.length };
  }

  function scoreSoFar(attempt) {
    let correct = 0, wrong = 0;
    attempt.questions.forEach(q => {
      if (q.chosen === null || q.chosen === undefined) return;
      if (q.chosen === q.answer) correct += 1; else wrong += 1;
    });
    return { correct: correct, wrong: wrong };
  }

  function formatDuration(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = n => String(n).padStart(2, '0');
    return (h > 0 ? h + ':' : '') + pad(m) + ':' + pad(s);
  }

  return { build, choose, grade, liveStats, scoreSoFar, shuffle, uid, formatDuration, titleFor, subtitleFor };
})();
