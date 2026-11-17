// 路由和页面渲染。题目文本一律通过 textContent 插入，禁止 innerHTML 拼接。
import * as store from './store.js';
import * as quiz from './quiz.js';

const $app = document.getElementById('app');
const $banner = document.getElementById('banner');
const LETTERS = ['A', 'B', 'C', 'D'];
const SHORT = { network: '计网', os: '操作系统', web: 'Web 安全', crypto: '密码学' };

let bank = null;          // { categories, questions }
let byId = new Map();
let session = null;
let lastResult = null;
let bypassLeaveGuard = false;
let currentRoute = '';

// ---------- DOM 工具 ----------
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** 把 `代码` 和 **加粗** 转成节点，全部走 textContent */
function rich(text) {
  const frag = document.createDocumentFragment();
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) frag.append(document.createTextNode(text.slice(last, m.index)));
    const tok = m[0];
    if (tok[0] === '`') frag.append(h('code', { text: tok.slice(1, -1) }));
    else frag.append(h('strong', { text: tok.slice(2, -2) }));
    last = m.index + tok.length;
  }
  if (last < text.length) frag.append(document.createTextNode(text.slice(last)));
  return frag;
}

function plain(text) { return text.replace(/\*\*|`/g, ''); }

function icon(name) {
  const paths = {
    back: 'M15 18l-6-6 6-6',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
    star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
    chev: 'M9 18l6-6-6-6',
    shuffle: 'M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
    book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14zM20 17v4H6.5A2.5 2.5 0 0 1 4 18.5',
  };
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', paths[name]);
  svg.append(p);
  return svg;
}

function go(hash) { location.hash = hash; }

function fmtDuration(ms) {
  const s = Math.max(1, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m} 分 ${s % 60} 秒` : `${s} 秒`;
}

function pct(n, d) { return d ? Math.round((n / d) * 100) + '%' : '—'; }

// ---------- 弹窗与底部抽屉 ----------
function modal({ title, body, okText = '确定', cancelText = '取消', danger = false }) {
  return new Promise((resolve) => {
    const close = (v) => { overlay.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    const ok = h('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), onclick: () => close(true), text: okText });
    const overlay = h('div', { class: 'overlay', onclick: (e) => { if (e.target === overlay) close(false); } },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('h3', { text: title }),
        body ? h('p', { class: 'muted', text: body }) : null,
        h('div', { class: 'modal-actions' },
          cancelText ? h('button', { class: 'btn btn-ghost', onclick: () => close(false), text: cancelText }) : null,
          ok)));
    document.body.append(overlay);
    document.addEventListener('keydown', onKey);
    ok.focus();
  });
}

function segmented(name, options, value, onChange) {
  const wrap = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': name });
  const render = (v) => {
    wrap.replaceChildren(...options.map(([val, label]) =>
      h('button', {
        class: 'seg-btn' + (val === v ? ' on' : ''), role: 'radio', 'aria-checked': String(val === v),
        onclick: () => { onChange(val); render(val); }, text: label,
      })));
  };
  render(value);
  return wrap;
}

function sheet(title, content, startText, onStart) {
  const close = () => { overlay.classList.remove('show'); setTimeout(() => overlay.remove(), 200); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const overlay = h('div', { class: 'overlay sheet-overlay', onclick: (e) => { if (e.target === overlay) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'sheet-handle' }),
      h('h3', { text: title }),
      content,
      h('button', { class: 'btn btn-primary btn-block', onclick: () => { close(); onStart(); }, text: startText })));
  document.body.append(overlay);
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => overlay.classList.add('show'));
}

function openPracticeSheet(catId) {
  const s = store.settings();
  const cfg = Object.assign({}, s.lastQuizConfig);
  const pool = poolFor(catId);
  const name = catId === 'mix' ? '随机混合' : catName(catId);
  const content = h('div', { class: 'sheet-body' },
    h('div', { class: 'field' }, h('label', { text: '题量' }),
      segmented('题量', [[10, '10 题'], [20, '20 题'], ['all', `全部 ${pool.length}`]], cfg.count, (v) => { cfg.count = v; })),
    h('div', { class: 'field' }, h('label', { text: '顺序' }),
      segmented('顺序', [['random', '随机'], ['topic', '按知识点']], cfg.order, (v) => { cfg.order = v; })),
    h('div', { class: 'field' }, h('label', { text: '范围' }),
      segmented('范围', [['all', '全部题目'], ['new', '只做没做过的']], cfg.scope, (v) => { cfg.scope = v; })));
  sheet(name, content, '开始练习', () => {
    store.setSetting('lastQuizConfig', cfg);
    const list = quiz.buildPractice(pool, cfg);
    if (!list.length) {
      modal({ title: '没有可做的题', body: '这个范围内的题都做过了，可以把范围改为「全部题目」。', cancelText: null });
      return;
    }
    startSession(list, { kind: 'practice', category: catId, title: name });
  });
}

function openWrongSheet(filter) {
  const pool = poolFor(filter === 'all' ? 'mix' : filter);
  const n = quiz.buildWrong(pool, 'all').length;
  let count = Math.min(n, 10) === n ? 'all' : 10;
  const opts = [[10, '10 题'], [20, '20 题'], ['all', `全部 ${n}`]].filter(([v]) => v === 'all' || v < n);
  const content = h('div', { class: 'sheet-body' },
    h('p', { class: 'muted', text: '错误次数多的先出，选项顺序重新打乱。' }),
    h('div', { class: 'field' }, h('label', { text: '题量' }), segmented('题量', opts, count, (v) => { count = v; })));
  sheet('刷错题', content, '开始', () => {
    startSession(quiz.buildWrong(pool, count), { kind: 'wrong', category: filter, title: '错题重刷' });
  });
}

// ---------- 数据工具 ----------
function catName(id) { return (bank.categories.find((c) => c.id === id) || {}).name || id; }
function poolFor(catId) { return catId === 'mix' ? bank.questions : bank.questions.filter((q) => q.category === catId); }
function pendingIds() { return bank.questions.filter((q) => store.isPending(q.id)).map((q) => q.id); }

function catStats(catId) {
  const recs = store.get().records;
  const qs = poolFor(catId);
  let done = 0, right = 0, pending = 0;
  for (const q of qs) {
    const r = recs[q.id];
    if (r) { done++; if (r.lastCorrect) right++; }
    if (store.isPending(q.id)) pending++;
  }
  return { total: qs.length, done, right, pending };
}

function startSession(list, meta) {
  session = quiz.createSession(list, meta);
  session.pendingBefore = pendingIds().length;
  const target = '#/quiz/' + (meta.kind === 'practice' ? meta.category : meta.kind);
  if (location.hash === target) { render(); window.scrollTo(0, 0); return; } // 同一路由不会触发 hashchange
  bypassLeaveGuard = true;
  go(target);
}

// ---------- 视图：首页 ----------
function viewHome() {
  const total = bank.questions.length;
  const pend = pendingIds().length;
  const all = catStats('mix');
  const header = h('header', { class: 'topbar' },
    h('div', { class: 'brand' }, h('span', { class: 'logo', text: '🛡' }), h('span', { text: '网安面试刷题' })),
    h('button', { class: 'icon-btn', 'aria-label': '设置', onclick: () => go('#/settings') }, icon('gear')));

  const overview = h('section', { class: 'overview' },
    h('div', { class: 'ov-item' }, h('b', { text: `${all.done}/${total}` }), h('span', { text: '已做' })),
    h('div', { class: 'ov-item' }, h('b', { text: pct(all.right, all.done) }), h('span', { text: '正确率' })),
    h('div', { class: 'ov-item' }, h('b', { text: String(pend) }), h('span', { text: '待复习' })));

  const wrongEntry = h('button', { class: 'wrong-entry', onclick: () => go('#/wrong') },
    icon('book'),
    h('span', { class: 'we-text' }, h('b', { text: '错题集' }), h('small', { text: pend ? '面试前重点过一遍' : '还没有错题' })),
    pend ? h('span', { class: 'badge', text: String(pend) }) : null,
    icon('chev'));

  const cards = bank.categories.map((c) => {
    const st = catStats(c.id);
    const progress = h('div', { class: 'mini-bar' }, h('i'));
    progress.firstChild.style.width = (st.done / st.total) * 100 + '%';
    return h('button', { class: 'cat-card cat-' + c.id, onclick: () => openPracticeSheet(c.id) },
      h('div', { class: 'cat-head' }, h('b', { text: c.name }), h('span', { class: 'muted', text: `${st.total} 题` })),
      progress,
      h('div', { class: 'cat-meta' },
        h('span', { text: `已做 ${st.done}/${st.total}` }),
        h('span', { text: `正确率 ${pct(st.right, st.done)}` }),
        st.pending ? h('span', { class: 'pend', text: `待复习 ${st.pending}` }) : null));
  });

  const mix = h('button', { class: 'mix-card', onclick: () => openPracticeSheet('mix') },
    icon('shuffle'), h('span', { class: 'we-text' }, h('b', { text: '随机混合' }), h('small', { text: `四个分类共 ${total} 题` })), icon('chev'));

  return [header, h('main', { class: 'page' }, overview, wrongEntry, h('h2', { class: 'section-title', text: '分类练习' }), h('div', { class: 'cat-grid' }, cards), mix,
    h('p', { class: 'foot muted', text: `题库更新于 ${bank.updatedAt} · 进度仅保存在本浏览器` }))];
}

// ---------- 视图：答题 ----------
function viewQuiz() {
  if (!session) { go('#/home'); return []; }
  const it = session.items[session.index];
  const q = it.q;
  const n = session.items.length;
  const answered = it.choice !== null;

  const bar = h('div', { class: 'progress' }, h('i'));
  bar.firstChild.style.width = ((session.index + (answered ? 1 : 0)) / n) * 100 + '%';

  const header = h('header', { class: 'topbar quizbar' },
    h('button', { class: 'icon-btn', 'aria-label': '返回', onclick: () => go('#/home') }, icon('back')),
    h('div', { class: 'qprog' }, h('span', { text: `${session.index + 1} / ${n}` }), bar),
    h('span', { class: 'score', 'aria-label': '本轮答对', text: `✓ ${session.correctCount}` }));

  const starred = store.isPending(q.id);
  const starBtn = h('button', {
    class: 'star-btn' + (starred ? ' on' : ''), 'aria-pressed': String(starred),
    'aria-label': starred ? '已在错题集' : '加入错题集',
    title: starred ? '已在错题集' : '加入错题集（蒙对的题）',
    onclick: () => { if (!store.isPending(q.id)) { store.addManual(q.id); render(); } },
  }, icon('star'), h('span', { text: starred ? '已收藏' : '收藏' }));

  const opts = h('div', { class: 'options' }, it.order.map((orig, k) => {
    let cls = 'opt';
    let mark = null;
    if (answered) {
      if (orig === q.answer) { cls += ' correct'; mark = '✓'; }
      else if (orig === it.choice) { cls += ' wrong'; mark = '✗'; }
      else cls += ' dim';
    }
    return h('button', {
      class: cls, disabled: answered, 'data-k': k,
      'aria-label': `${LETTERS[k]}. ${plain(q.options[orig])}` + (mark === '✓' ? '（正确答案）' : mark === '✗' ? '（你的选择，错误）' : ''),
      onclick: () => choose(k),
    },
      h('span', { class: 'opt-letter', text: LETTERS[k] }),
      h('span', { class: 'opt-text' }, rich(q.options[orig])),
      mark ? h('span', { class: 'opt-mark', 'aria-hidden': 'true', text: mark }) : null);
  }));

  let exp = null;
  if (answered) {
    const correctLetter = LETTERS[it.order.indexOf(q.answer)];
    exp = h('section', { class: 'explain ' + (it.correct ? 'ok' : 'bad'), 'aria-live': 'polite' },
      h('div', { class: 'exp-head', text: it.correct ? '✓ 回答正确' : `✗ 回答错误，正确答案是 ${correctLetter}` }),
      it.mastered ? h('div', { class: 'exp-note', text: `🎉 已连续答对 ${store.settings().masterThreshold} 次，移出错题集` }) : null,
      h('p', {}, rich(q.explanation)),
      h('div', { class: 'tags' }, h('span', { class: 'tag', text: q.topic }), (q.tags || []).map((t) => h('span', { class: 'tag tag-hl', text: t }))));
  }

  const card = h('article', { class: 'qcard' },
    h('div', { class: 'qmeta' },
      h('span', { class: 'chip cat-' + q.category, text: SHORT[q.category] }),
      h('span', { class: 'chip', text: '难度 ' + '●'.repeat(q.difficulty) + '○'.repeat(3 - q.difficulty) }),
      starBtn),
    h('h2', { class: 'stem' }, rich(q.stem)),
    q.code ? h('pre', { class: 'codeblock' }, h('code', { text: q.code })) : null,
    opts, exp);

  const isLast = session.index === n - 1;
  const footer = h('div', { class: 'bottom-bar' + (answered ? ' show' : '') },
    h('button', { class: 'btn btn-primary btn-block', id: 'next', disabled: !answered, onclick: next, text: isLast ? '查看结果' : '下一题' }));

  return [header, h('main', { class: 'page quiz-page' }, card), footer];
}

function choose(k) {
  if (!session) return;
  const it = session.items[session.index];
  if (it.choice !== null) return;
  quiz.answer(session, k);
  render();
  const btn = document.getElementById('next');
  const exp = document.querySelector('.explain');
  if (exp && window.matchMedia('(max-width: 720px)').matches) exp.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (btn && !window.matchMedia('(pointer: coarse)').matches) btn.focus({ preventScroll: true });
}

function next() {
  if (!session) return;
  const it = session.items[session.index];
  if (it.choice === null) return;
  if (session.index < session.items.length - 1) {
    session.index++;
    render();
    window.scrollTo(0, 0);
  } else {
    finish();
  }
}

function finish() {
  session.finishedAt = Date.now();
  lastResult = session;
  lastResult.pendingAfter = pendingIds().length;
  session = null;
  bypassLeaveGuard = true;
  go('#/result');
}

// ---------- 视图：结果 ----------
function viewResult() {
  const r = lastResult;
  if (!r) { go('#/home'); return []; }
  const n = r.items.length;
  const wrongs = r.items.filter((x) => x.correct === false);
  const masteredNow = r.items.filter((x) => x.mastered).length;
  const rate = Math.round((r.correctCount / n) * 100);

  const ring = h('div', { class: 'ring' }, h('b', { text: rate + '%' }), h('span', { text: '正确率' }));
  ring.style.setProperty('--p', rate);

  const stats = h('div', { class: 'res-stats' },
    h('div', {}, h('b', { text: `${r.correctCount}/${n}` }), h('span', { text: '答对' })),
    h('div', {}, h('b', { text: fmtDuration(r.finishedAt - r.startedAt) }), h('span', { text: '用时' })));

  let wrongInfo = null;
  if (r.meta.kind === 'wrong' || r.meta.kind === 'retry') {
    wrongInfo = h('div', { class: 'notice ok' },
      r.pendingAfter === 0 ? '🎉 错题集已清空，全部掌握！' : `本轮移出 ${masteredNow} 题，错题集还剩 ${r.pendingAfter} 题`);
  }

  const list = wrongs.length
    ? h('section', {}, h('h2', { class: 'section-title', text: `本轮答错 ${wrongs.length} 题` }),
      h('div', { class: 'wlist' }, wrongs.map((x) => wrongItem(x.q, { lastChoice: x.choice }))))
    : h('div', { class: 'empty' }, h('div', { class: 'empty-emoji', text: '💯' }), h('p', { text: '本轮全部答对！' }));

  const actions = h('div', { class: 'res-actions' },
    wrongs.length ? h('button', {
      class: 'btn btn-primary btn-block', text: `重做本轮错题（${wrongs.length}）`,
      onclick: () => startSession(quiz.shuffle(wrongs.map((x) => x.q)), { kind: 'retry', category: r.meta.category, title: '重做错题' }),
    }) : null,
    (r.meta.kind === 'wrong' && r.pendingAfter > 0) ? h('button', {
      class: 'btn btn-secondary btn-block', text: '再刷一轮错题', onclick: () => openWrongSheet(r.meta.category || 'all'),
    }) : null,
    h('button', { class: 'btn btn-ghost btn-block', text: '返回首页', onclick: () => go('#/home') }));

  return [h('header', { class: 'topbar' },
    h('button', { class: 'icon-btn', 'aria-label': '返回首页', onclick: () => go('#/home') }, icon('back')),
    h('div', { class: 'brand', text: r.meta.title + ' · 结果' }), h('span')),
  h('main', { class: 'page' }, h('section', { class: 'res-top' }, ring, stats), wrongInfo, actions, list)];
}

/** 可展开的错题条目 */
function wrongItem(q, opts = {}) {
  const w = store.get().wrongBook[q.id];
  const th = store.settings().masterThreshold;
  const lastChoice = opts.lastChoice ?? (w ? w.lastWrongChoice : null);
  const s = plain(q.stem);
  const body = h('div', { class: 'wi-body' },
    s.length > 40 ? h('p', { class: 'wi-stem' }, rich(q.stem)) : null,
    q.code ? h('pre', { class: 'codeblock' }, h('code', { text: q.code })) : null,
    h('ul', { class: 'wi-opts' }, q.options.map((o, i) => h('li', {
      class: i === q.answer ? 'correct' : i === lastChoice ? 'wrong' : '',
    }, h('span', { class: 'wi-mark', 'aria-hidden': 'true', text: i === q.answer ? '✓' : i === lastChoice ? '✗' : '·' }),
      h('span', {}, rich(o)),
      i === q.answer ? h('em', { text: '正确答案' }) : i === lastChoice ? h('em', { text: '上次选择' }) : null))),
    h('p', { class: 'wi-exp' }, rich(q.explanation)),
    opts.actions || null);
  const meta = [h('span', { class: 'chip cat-' + q.category, text: SHORT[q.category] })];
  if (w && opts.showMeta) {
    if (w.wrongCount) meta.push(h('span', { class: 'chip chip-bad', text: `错 ${w.wrongCount} 次` }));
    if (w.source === 'manual' && !w.wrongCount) meta.push(h('span', { class: 'chip', text: '手动收藏' }));
    if (w.status === 'pending') meta.push(h('span', { class: 'chip', text: `已连对 ${w.streak || 0} / ${th}` }));
  }
  const d = h('details', { class: 'witem' },
    h('summary', {}, h('span', { class: 'wi-title', text: s.length > 40 ? s.slice(0, 40) + '…' : s }), h('span', { class: 'wi-meta' }, meta)),
    body);
  return d;
}

// ---------- 视图：错题集 ----------
const wrongUI = { tab: 'pending', filter: 'all', sort: 'recent' };

function viewWrong() {
  const wb = store.get().wrongBook;
  const inBook = bank.questions.filter((q) => wb[q.id]);
  const pend = inBook.filter((q) => wb[q.id].status === 'pending');
  const mast = inBook.filter((q) => wb[q.id].status === 'mastered');
  const tabList = wrongUI.tab === 'pending' ? pend : mast;
  const filtered = tabList.filter((q) => wrongUI.filter === 'all' || q.category === wrongUI.filter);
  const sorted = filtered.slice().sort((a, b) => wrongUI.sort === 'count'
    ? (wb[b.id].wrongCount - wb[a.id].wrongCount) || ((wb[b.id].lastWrongAt || 0) - (wb[a.id].lastWrongAt || 0))
    : ((wb[b.id].lastWrongAt || wb[b.id].addedAt) - (wb[a.id].lastWrongAt || wb[a.id].addedAt)));

  const tabs = h('div', { class: 'tabs', role: 'tablist' },
    [['pending', `待复习（${pend.length}）`], ['mastered', `已掌握（${mast.length}）`]].map(([k, l]) =>
      h('button', { class: 'tab' + (wrongUI.tab === k ? ' on' : ''), role: 'tab', 'aria-selected': String(wrongUI.tab === k),
        onclick: () => { wrongUI.tab = k; render(); }, text: l })));

  const chips = h('div', { class: 'filters' },
    [['all', '全部'], ...bank.categories.map((c) => [c.id, SHORT[c.id]])].map(([k, l]) => {
      const cnt = k === 'all' ? tabList.length : tabList.filter((q) => q.category === k).length;
      return h('button', { class: 'fchip' + (wrongUI.filter === k ? ' on' : ''), onclick: () => { wrongUI.filter = k; render(); } },
        l, h('span', { class: 'fcount', text: String(cnt) }));
    }));

  const sortSel = h('select', { class: 'sort', 'aria-label': '排序', onchange: (e) => { wrongUI.sort = e.target.value; render(); } },
    h('option', { value: 'recent', text: '最近答错优先' }), h('option', { value: 'count', text: '错误次数多优先' }));
  sortSel.value = wrongUI.sort;

  // 错得最多的 3 个知识点（按累计错误次数）
  const topicErr = new Map();
  for (const q of inBook) topicErr.set(q.topic, (topicErr.get(q.topic) || 0) + (wb[q.id].wrongCount || 0));
  const top3 = [...topicErr.entries()].filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const weak = top3.length ? h('section', { class: 'weak' }, h('div', { class: 'weak-title', text: '🎯 错得最多的知识点' }),
    h('ol', {}, top3.map(([t, c]) => h('li', {}, h('span', { text: t }), h('em', { text: `错 ${c} 次` }))))) : null;

  let content;
  if (!sorted.length) {
    const emptyText = wrongUI.tab === 'pending'
      ? (pend.length ? '这个分类下没有待复习的题' : (mast.length ? '🎉 错题都已掌握' : '还没有错题，去刷几道试试'))
      : '还没有已掌握的错题';
    content = h('div', { class: 'empty' }, h('div', { class: 'empty-emoji', text: wrongUI.tab === 'pending' && !pend.length ? '📭' : '🗂' }),
      h('p', { text: emptyText }),
      h('button', { class: 'btn btn-secondary', onclick: () => go('#/home'), text: '返回首页' }));
  } else {
    content = h('div', { class: 'wlist' }, sorted.map((q) => wrongItem(q, {
      showMeta: true,
      actions: h('div', { class: 'wi-actions' }, wrongUI.tab === 'pending'
        ? h('button', { class: 'btn btn-small btn-secondary', onclick: () => { store.setMastered(q.id); render(); }, text: '✓ 标记已掌握' })
        : h('button', { class: 'btn btn-small btn-secondary', onclick: () => { store.readd(q.id); render(); }, text: '↺ 重新加入' })),
    })));
  }

  const nPending = pend.filter((q) => wrongUI.filter === 'all' || q.category === wrongUI.filter).length;
  const footer = wrongUI.tab === 'pending' && nPending
    ? h('div', { class: 'bottom-bar show' }, h('button', { class: 'btn btn-primary btn-block', onclick: () => openWrongSheet(wrongUI.filter), text: `开始刷错题（${nPending} 题）` }))
    : null;

  return [h('header', { class: 'topbar' },
    h('button', { class: 'icon-btn', 'aria-label': '返回首页', onclick: () => go('#/home') }, icon('back')),
    h('div', { class: 'brand', text: '错题集' }), h('span')),
  h('main', { class: 'page' + (footer ? ' has-bottom' : '') }, tabs, weak, h('div', { class: 'toolbar' }, chips, sortSel), content), footer];
}

// ---------- 视图：设置 ----------
function viewSettings() {
  const s = store.settings();
  const toggle = h('button', {
    class: 'switch' + (s.shuffleOptions ? ' on' : ''), role: 'switch', 'aria-checked': String(s.shuffleOptions), 'aria-label': '打乱选项顺序',
    onclick: () => { store.setSetting('shuffleOptions', !store.settings().shuffleOptions); render(); },
  }, h('i'));

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden', onchange: onImport });

  const rows = h('div', { class: 'settings' },
    h('section', { class: 'group' },
      h('div', { class: 'row' }, h('div', {}, h('b', { text: '打乱选项顺序' }), h('small', { text: '避免记住答案位置' })), toggle),
      h('div', { class: 'row col' }, h('div', {}, h('b', { text: '移出错题集的条件' }), h('small', { text: '待复习的题连续答对几次后自动移到「已掌握」' })),
        segmented('移出阈值', [[1, '1 次'], [2, '2 次'], [3, '3 次']], s.masterThreshold, (v) => store.setSetting('masterThreshold', v)))),
    h('section', { class: 'group' },
      h('div', { class: 'row' }, h('div', {}, h('b', { text: '导出进度' }), h('small', { text: '下载 JSON 备份，可在其他设备导入' })),
        h('button', { class: 'btn btn-small btn-secondary', onclick: onExport, text: '导出' })),
      h('div', { class: 'row' }, h('div', {}, h('b', { text: '导入进度' }), h('small', { text: '会覆盖当前浏览器里的进度' })),
        h('button', { class: 'btn btn-small btn-secondary', onclick: () => fileInput.click(), text: '导入' }), fileInput),
      h('div', { class: 'row' }, h('div', {}, h('b', { text: '清空全部数据' }), h('small', { text: '做题记录和错题集都会删除' })),
        h('button', { class: 'btn btn-small btn-danger', onclick: onClear, text: '清空' }))),
    h('section', { class: 'group note' },
      h('b', { text: '关于进度保存' }),
      h('ul', {},
        h('li', { text: '进度只保存在当前浏览器，不会上传到任何服务器。' }),
        h('li', { text: '清除浏览器数据或使用无痕模式会丢失进度。' }),
        h('li', { text: 'iOS Safari 会清除 7 天内未访问网站的本地数据；把网站「添加到主屏幕」可以避免。' }),
        h('li', { text: '建议定期导出备份。换设备时用导出 / 导入迁移。' }))),
    h('section', { class: 'group note' },
      h('b', { text: '键盘快捷键（电脑）' }),
      h('p', { class: 'muted', text: '1–4 或 A–D 选择选项，Enter 进入下一题，Esc 关闭弹窗。' })));

  return [h('header', { class: 'topbar' },
    h('button', { class: 'icon-btn', 'aria-label': '返回首页', onclick: () => go('#/home') }, icon('back')),
    h('div', { class: 'brand', text: '设置' }), h('span')),
  h('main', { class: 'page' }, rows)];
}

function onExport() {
  const d = new Date();
  const name = `secquiz-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
  const url = URL.createObjectURL(new Blob([store.exportJSON()], { type: 'application/json' }));
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function onImport(e) {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const text = await f.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { return modal({ title: '导入失败', body: '文件不是有效的 JSON。', cancelText: null }); }
  const err = store.validateShape(parsed);
  if (err) return modal({ title: '导入失败', body: err + '，现有数据未改动。', cancelText: null });
  const ok = await modal({ title: '确认导入', body: '将覆盖当前进度，此操作不可撤销。', okText: '覆盖导入', danger: true });
  if (!ok) return;
  const e2 = store.importJSON(text);
  if (e2) return modal({ title: '导入失败', body: e2, cancelText: null });
  store.prune(byId);
  await modal({ title: '导入成功', body: `已导入，错题集现有 ${pendingIds().length} 道待复习。`, cancelText: null });
  render();
}

async function onClear() {
  const ok1 = await modal({ title: '清空全部数据？', body: '做题记录、错题集和设置都会被删除。', okText: '继续', danger: true });
  if (!ok1) return;
  const ok2 = await modal({ title: '再次确认', body: '删除后无法恢复。建议先导出备份。', okText: '确认清空', danger: true });
  if (!ok2) return;
  store.clearAll();
  render();
}

// ---------- 路由 ----------
function parseRoute() {
  const hsh = location.hash.replace(/^#\/?/, '') || 'home';
  return hsh;
}

function render() {
  const r = parseRoute();
  currentRoute = r;
  let nodes;
  if (r.startsWith('quiz')) nodes = viewQuiz();
  else if (r === 'result') nodes = viewResult();
  else if (r === 'wrong') nodes = viewWrong();
  else if (r === 'settings') nodes = viewSettings();
  else nodes = viewHome();
  document.body.dataset.view = r.split('/')[0];
  $app.replaceChildren(...nodes.filter(Boolean));
}

let prevHash = location.hash;
window.addEventListener('hashchange', async () => {
  const leavingQuiz = prevHash.startsWith('#/quiz') && !location.hash.startsWith('#/quiz');
  if (leavingQuiz && session && !bypassLeaveGuard) {
    const target = location.hash;
    history.replaceState(null, '', prevHash);
    const ok = await modal({ title: '退出本轮练习？', body: '退出后本轮进度不保留，已答的题仍会记录。', okText: '退出' });
    if (!ok) return;
    session = null;
    bypassLeaveGuard = true;
    prevHash = target;
    history.replaceState(null, '', target);
  }
  bypassLeaveGuard = false;
  prevHash = location.hash;
  render();
  window.scrollTo(0, 0);
});

document.addEventListener('keydown', (e) => {
  if (!session || !currentRoute.startsWith('quiz')) return;
  if (document.querySelector('.overlay')) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  const map = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 };
  if (k in map) { e.preventDefault(); choose(map[k]); }
  else if (e.key === 'Enter') {
    if (document.activeElement && document.activeElement.id === 'next') return; // 交给按钮本身
    e.preventDefault(); next();
  }
});

// ---------- 启动 ----------
async function boot() {
  const st = store.init();
  if (st.memoryOnly) showBanner('当前浏览器无法保存进度，关闭页面后记录会丢失');
  else if (st.readOnly) showBanner('检测到更新版本的数据，请刷新页面；当前为只读模式');
  try {
    const res = await fetch('data/questions.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    bank = await res.json();
  } catch {
    $app.replaceChildren(h('main', { class: 'page' }, h('div', { class: 'empty' },
      h('div', { class: 'empty-emoji', text: '⚠️' }), h('p', { text: '题库加载失败，请检查网络后刷新。' }),
      h('button', { class: 'btn btn-primary', onclick: () => location.reload(), text: '重新加载' }))));
    return;
  }
  byId = new Map(bank.questions.map((q) => [q.id, q]));
  store.prune(byId);
  if (location.hash.startsWith('#/quiz') || location.hash === '#/result') history.replaceState(null, '', '#/home');
  prevHash = location.hash;
  render();
}

function showBanner(text) { $banner.textContent = text; $banner.hidden = false; }

boot();
