// localStorage 读写、版本迁移、导入导出
const KEY = 'secquiz:data';
export const SCHEMA_VERSION = 1;

const migrations = {
  // 1: (d) => { ...; d.schemaVersion = 2; return d; }
};

function emptyData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    records: {},
    wrongBook: {},
    settings: {
      shuffleOptions: true,
      masterThreshold: 2,
      lastQuizConfig: { count: 10, order: 'random', scope: 'all' },
    },
  };
}

let data = emptyData();
let memoryOnly = false;
let readOnly = false;

function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

export function validateShape(d) {
  if (!isObj(d)) return '不是有效的 JSON 对象';
  if (typeof d.schemaVersion !== 'number') return '缺少 schemaVersion';
  if (d.schemaVersion > SCHEMA_VERSION) return '数据版本比当前页面新，请先刷新页面';
  if (!isObj(d.records)) return 'records 字段格式错误';
  if (!isObj(d.wrongBook)) return 'wrongBook 字段格式错误';
  if (d.settings !== undefined && !isObj(d.settings)) return 'settings 字段格式错误';
  return null;
}

function normalize(d) {
  const base = emptyData();
  d.settings = Object.assign(base.settings, d.settings || {});
  d.settings.lastQuizConfig = Object.assign(emptyData().settings.lastQuizConfig, d.settings.lastQuizConfig || {});
  return d;
}

function migrate(d) {
  while (d.schemaVersion < SCHEMA_VERSION) {
    const fn = migrations[d.schemaVersion];
    if (!fn) break;
    d = fn(d);
  }
  return d;
}

export function init() {
  let raw = null;
  try {
    const t = '__secquiz_test__';
    localStorage.setItem(t, '1');
    localStorage.removeItem(t);
    raw = localStorage.getItem(KEY);
  } catch {
    memoryOnly = true;
    return { memoryOnly, readOnly };
  }
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (isObj(parsed) && typeof parsed.schemaVersion === 'number' && parsed.schemaVersion > SCHEMA_VERSION) {
        data = normalize(parsed);
        readOnly = true;
        return { memoryOnly, readOnly };
      }
      const err = validateShape(parsed);
      if (err) throw new Error(err);
      const before = parsed.schemaVersion;
      data = normalize(migrate(parsed));
      if (data.schemaVersion !== before) save();
    } catch {
      try { localStorage.setItem('secquiz:corrupt-' + Date.now(), raw); } catch {}
      data = emptyData();
      save();
    }
  }
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch {}
  return { memoryOnly, readOnly };
}

export function save() {
  if (memoryOnly || readOnly) return;
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
}

export function get() { return data; }
export function settings() { return data.settings; }

export function setSetting(k, v) { data.settings[k] = v; save(); }

// 题库更新后清理不存在的 id
export function prune(validIds) {
  let changed = false;
  for (const k of ['records', 'wrongBook']) {
    for (const id of Object.keys(data[k])) {
      if (!validIds.has(id)) { delete data[k][id]; changed = true; }
    }
  }
  if (changed) save();
}

/**
 * 记录一次作答，返回 { mastered: bool }
 * choice 为原始下标
 */
export function recordAnswer(id, choice, correct) {
  const now = Date.now();
  const r = data.records[id] || { attempts: 0, correctCount: 0 };
  r.attempts += 1;
  if (correct) r.correctCount += 1;
  r.lastChoice = choice;
  r.lastCorrect = correct;
  r.lastAt = now;
  data.records[id] = r;

  let mastered = false;
  const w = data.wrongBook[id];
  if (!correct) {
    data.wrongBook[id] = {
      status: 'pending',
      source: w ? w.source : 'auto',
      wrongCount: (w ? w.wrongCount : 0) + 1,
      streak: 0,
      lastWrongChoice: choice,
      addedAt: w && w.status === 'pending' ? w.addedAt : now,
      lastWrongAt: now,
    };
  } else if (w && w.status === 'pending') {
    w.streak = (w.streak || 0) + 1;
    if (w.streak >= data.settings.masterThreshold) {
      w.status = 'mastered';
      w.masteredAt = now;
      mastered = true;
    }
  }
  save();
  return { mastered };
}

export function addManual(id) {
  const now = Date.now();
  const w = data.wrongBook[id];
  if (w && w.status === 'pending') return;
  data.wrongBook[id] = Object.assign({ wrongCount: 0, lastWrongAt: null, lastWrongChoice: null }, w || {}, {
    status: 'pending', source: 'manual', streak: 0, addedAt: now,
  });
  save();
}

export function setMastered(id) {
  const w = data.wrongBook[id];
  if (!w) return;
  w.status = 'mastered';
  w.masteredAt = Date.now();
  save();
}

export function readd(id) {
  const w = data.wrongBook[id];
  if (!w) return;
  w.status = 'pending';
  w.streak = 0;
  w.addedAt = Date.now();
  save();
}

export function isPending(id) {
  const w = data.wrongBook[id];
  return !!(w && w.status === 'pending');
}

export function exportJSON() { return JSON.stringify(data, null, 2); }

export function importJSON(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { return '文件不是有效的 JSON'; }
  const err = validateShape(parsed);
  if (err) return err;
  data = normalize(migrate(parsed));
  save();
  return null;
}

export function clearAll() {
  data = emptyData();
  save();
}
