// 组卷、判题、答题流程
import * as store from './store.js';

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 返回显示顺序：order[k] = 显示在第 k 位的选项的原始下标 */
export function optionOrder(q, shuffleOn) {
  const idx = [0, 1, 2, 3];
  return shuffleOn && !q.fixedOrder ? shuffle(idx) : idx;
}

/** 判题只看原始下标 */
export function judge(q, originalIndex) {
  return originalIndex === q.answer;
}

/**
 * 普通练习组卷
 * cfg: { count: 10|20|'all', order: 'random'|'topic', scope: 'all'|'new' }
 */
export function buildPractice(pool, cfg) {
  const records = store.get().records;
  let list = pool;
  if (cfg.scope === 'new') list = list.filter((q) => !records[q.id]);
  if (cfg.order === 'topic') {
    // 知识点顺序按题库出现顺序，组内保持题库顺序
    const rank = new Map();
    list.forEach((q) => { if (!rank.has(q.topic)) rank.set(q.topic, rank.size); });
    list = list.slice().sort((a, b) => rank.get(a.topic) - rank.get(b.topic));
    if (cfg.count !== 'all' && list.length > cfg.count) {
      // 随机起点的连续片段，保持知识点顺序
      const start = Math.floor(Math.random() * (list.length - cfg.count + 1));
      list = list.slice(start, start + cfg.count);
    }
  } else {
    list = shuffle(list);
    if (cfg.count !== 'all') list = list.slice(0, cfg.count);
  }
  return list;
}

/** 错题重刷：错误次数多的先出，相同的随机 */
export function buildWrong(pool, count) {
  const wb = store.get().wrongBook;
  let list = shuffle(pool.filter((q) => store.isPending(q.id)));
  list.sort((a, b) => (wb[b.id].wrongCount || 0) - (wb[a.id].wrongCount || 0));
  if (count !== 'all') list = list.slice(0, count);
  return list;
}

export function createSession(questions, meta) {
  const shuffleOn = store.settings().shuffleOptions;
  return {
    meta, // { kind: 'practice'|'wrong'|'retry', category, title }
    items: questions.map((q) => ({ q, order: optionOrder(q, shuffleOn), choice: null, correct: null, mastered: false })),
    index: 0,
    correctCount: 0,
    startedAt: Date.now(),
    finishedAt: null,
    pendingBefore: null,
  };
}

export function answer(session, displayIndex) {
  const it = session.items[session.index];
  if (it.choice !== null) return it;
  const orig = it.order[displayIndex];
  it.choice = orig;
  it.correct = judge(it.q, orig);
  if (it.correct) session.correctCount += 1;
  const { mastered } = store.recordAnswer(it.q.id, orig, it.correct);
  it.mastered = mastered;
  return it;
}
