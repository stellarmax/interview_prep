// 自动化测试：node tools/test.mjs
// 1) 打乱选项后，遍历全部题目验证判题结果（需求文档 9.3）
// 2) 错题集收录 / 连对移出 / 手动收藏 / 导入导出 流程
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as quiz from '../js/quiz.js';
import * as store from '../js/store.js';

// 内存版 localStorage
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.error('✗', msg); } };

const bank = JSON.parse(readFileSync(fileURLToPath(new URL('../data/questions.json', import.meta.url)), 'utf8'));
store.init();

// ---- 1. 判题 ----
for (const q of bank.questions) {
  for (let t = 0; t < 50; t++) {
    const order = quiz.optionOrder(q, true);
    ok([...order].sort().join() === '0,1,2,3', `${q.id} 打乱后不是 0-3 的排列`);
    const correctSlots = order.map((orig, k) => (quiz.judge(q, orig) ? k : -1)).filter((k) => k >= 0);
    ok(correctSlots.length === 1, `${q.id} 正确选项数 ${correctSlots.length}`);
    ok(q.options[order[correctSlots[0]]] === q.options[q.answer], `${q.id} 显示的正确选项文本不一致`);
  }
}

// session 级：答题记录原始下标
{
  const qs = bank.questions.slice(0, 20);
  const s = quiz.createSession(qs, { kind: 'practice' });
  for (let i = 0; i < qs.length; i++) {
    s.index = i;
    const it = s.items[i];
    const k = Math.floor(Math.random() * 4);
    quiz.answer(s, k);
    ok(it.choice === it.order[k], 'choice 应为原始下标');
    ok(it.correct === (it.order[k] === it.q.answer), 'correct 判定错误');
    ok(store.get().records[it.q.id].lastChoice === it.order[k], 'records.lastChoice 应为原始下标');
    const before = JSON.stringify(it);
    quiz.answer(s, (k + 1) % 4);
    ok(JSON.stringify(it) === before, '作答后应锁定，不允许修改');
  }
}

// ---- 2. 错题集 ----
store.clearAll();
const q = bank.questions[0];
const wrong = (q.answer + 1) % 4;
store.recordAnswer(q.id, wrong, false);
let w = store.get().wrongBook[q.id];
ok(w && w.status === 'pending' && w.wrongCount === 1 && w.streak === 0 && w.lastWrongChoice === wrong, '答错后应进入待复习');
let r = store.recordAnswer(q.id, q.answer, true);
ok(!r.mastered && store.get().wrongBook[q.id].streak === 1, '答对一次只累计连对');
store.recordAnswer(q.id, wrong, false);
w = store.get().wrongBook[q.id];
ok(w.streak === 0 && w.wrongCount === 2, '中途答错应清零连对');
store.recordAnswer(q.id, q.answer, true);
r = store.recordAnswer(q.id, q.answer, true);
ok(r.mastered && store.get().wrongBook[q.id].status === 'mastered', '连对 2 次应移到已掌握');
ok(store.get().wrongBook[q.id].wrongCount === 2, '移出后保留错误次数');
store.recordAnswer(q.id, wrong, false);
ok(store.get().wrongBook[q.id].status === 'pending', '已掌握再答错应回到待复习');

// 阈值 1
store.setSetting('masterThreshold', 1);
r = store.recordAnswer(q.id, q.answer, true);
ok(r.mastered, '阈值为 1 时答对一次即移出');
store.setSetting('masterThreshold', 2);

// 手动收藏
const q2 = bank.questions[1];
store.recordAnswer(q2.id, q2.answer, true);
ok(!store.isPending(q2.id), '答对不应进入错题集');
store.addManual(q2.id);
ok(store.isPending(q2.id) && store.get().wrongBook[q2.id].source === 'manual', '手动收藏应进入待复习');

// 错题重刷组卷：错误次数多的先出
const q3 = bank.questions[2];
for (let i = 0; i < 3; i++) store.recordAnswer(q3.id, (q3.answer + 1) % 4, false);
const list = quiz.buildWrong(bank.questions, 'all');
ok(list[0].id === q3.id, '错误次数最多的题应先出');
ok(list.every((x) => store.isPending(x.id)), '错题重刷只包含待复习题');

// 组卷：不重复、只做没做过的
const pr = quiz.buildPractice(bank.questions, { count: 20, order: 'random', scope: 'all' });
ok(new Set(pr.map((x) => x.id)).size === pr.length && pr.length === 20, '一轮练习中不应重复出题');
const fresh = quiz.buildPractice(bank.questions, { count: 'all', order: 'topic', scope: 'new' });
ok(fresh.every((x) => !store.get().records[x.id]), '只做没做过的');

// 导出 / 导入
const exported = store.exportJSON();
store.clearAll();
ok(Object.keys(store.get().wrongBook).length === 0, '清空后错题集为空');
ok(store.importJSON(exported) === null, '导入应成功');
ok(JSON.stringify(JSON.parse(store.exportJSON())) === JSON.stringify(JSON.parse(exported)), '导入后数据应完全一致');
ok(store.importJSON('{"schemaVersion":99,"records":{},"wrongBook":{}}') !== null, '更高版本数据应拒绝导入');
ok(store.importJSON('not json') !== null, '非法 JSON 应拒绝导入');
ok(store.isPending(q2.id), '导入失败不应改动现有数据');

// 持久化 + 损坏数据容错
const raw = mem.get('secquiz:data');
ok(raw && JSON.parse(raw).wrongBook[q2.id], '每次作答应立即写入 localStorage');
mem.set('secquiz:data', '{broken');
store.init();
ok([...mem.keys()].some((k) => k.startsWith('secquiz:corrupt-')), '损坏数据应备份到 secquiz:corrupt-*');
ok(Object.keys(store.get().records).length === 0, '损坏后重置为空数据');

// 题库清理
store.recordAnswer('not-exist-001', 0, false);
store.prune(new Set(bank.questions.map((x) => x.id)));
ok(!store.get().wrongBook['not-exist-001'], '不存在的 id 应被清理');

console.log(fails ? `\n${fails}/${checks} 项失败` : `✓ ${checks} 项检查全部通过`);
process.exit(fails ? 1 : 0);
