"""题库校验（需求文档 6.7 节）。用法：python tools/validate.py [data/questions.json]"""
import json, re, sys, collections
from pathlib import Path

path = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / 'data' / 'questions.json')
data = json.loads(path.read_text(encoding='utf-8'))
qs = data['questions']
errors, warns = [], []

EXPECT_CAT = {'network': 36, 'os': 28, 'web': 36, 'crypto': 24}
EXPECT_TOPIC = {
    'TCP 三次握手': 4, 'TCP 四次挥手与 TIME_WAIT': 4, 'SYN Flood': 3, 'TCP 与 UDP、可靠传输': 3, '流量控制与拥塞控制': 3,
    'HTTPS 与 TLS 握手': 4, 'DNS 及 DNS 攻击': 3, 'HTTP 基础': 4, 'Cookie / Session / JWT': 2, 'ARP 与 ARP 欺骗': 2,
    '分层模型、常见端口、ICMP、NAT': 2, 'DDoS 与反射放大': 2,
    '进程、线程、协程': 3, '进程间通信': 2, '死锁': 3, '虚拟内存与分页': 2, '用户态与内核态': 2, '缓冲区溢出及缓解措施': 4,
    'Linux 权限与 SUID': 4, 'Linux 提权': 3, 'Linux 应急排查': 3, 'Windows 应急': 2,
    'SQL 注入': 5, 'XSS': 4, 'CSRF': 3, 'SSRF': 4, '文件上传': 3, '文件包含与目录穿越': 2, '命令注入': 3, '反序列化': 3,
    'XXE': 2, '越权与逻辑漏洞': 3, '同源策略、CORS、点击劫持、安全响应头': 2, 'WAF / IDS / IPS': 2,
    '对称与非对称加密': 4, 'AES 分组模式': 3, '哈希与 HMAC': 4, '密码存储': 3, '数字签名与证书': 4,
    '中间人攻击与 DH 密钥交换': 3, '编码、加密、哈希的区别与重放攻击': 3,
}
REQ = {'id': str, 'category': str, 'topic': str, 'style': str, 'difficulty': int, 'stem': str,
       'options': list, 'answer': int, 'explanation': str}
ID_RE = re.compile(r'^(network|os|web|crypto)-[a-z0-9-]+-\d{3}$')
LETTER_RE = re.compile(r'^\s*[A-Da-d][.、．:：)]')
EXP_LETTER_RE = re.compile(r'选项\s*[A-D]|[（(][A-D][)）]|\b[A-D] 项')

seen = set()
for q in qs:
    qid = q.get('id', '?')
    for k, t in REQ.items():
        if k not in q or not isinstance(q[k], t) or (t is int and isinstance(q[k], bool)):
            errors.append(f'{qid}: 字段 {k} 缺失或类型错误')
    if qid in seen: errors.append(f'{qid}: id 重复')
    seen.add(qid)
    if not ID_RE.match(qid) or not qid.startswith(q.get('category', '') + '-'): errors.append(f'{qid}: id 格式不符')
    if q.get('category') not in EXPECT_CAT: errors.append(f'{qid}: category 非法')
    if q.get('style') not in ('concept', 'scenario', 'defense'): errors.append(f'{qid}: style 非法')
    if q.get('difficulty') not in (1, 2, 3): errors.append(f'{qid}: difficulty 非法')
    if q.get('topic') not in EXPECT_TOPIC: errors.append(f'{qid}: topic 不在第 4 节列表中')
    opts = q.get('options', [])
    if len(opts) != 4: errors.append(f'{qid}: options 不是 4 个')
    if len(set(opts)) != len(opts): errors.append(f'{qid}: options 有重复')
    for o in opts:
        if not isinstance(o, str) or not o.strip(): errors.append(f'{qid}: options 有空串')
        elif LETTER_RE.match(o): errors.append(f'{qid}: 选项以字母前缀开头：{o}')
        elif '以上' in o: errors.append(f'{qid}: 选项含「以上」：{o}')
    if q.get('answer') not in (0, 1, 2, 3): errors.append(f'{qid}: answer 不在 0-3')
    exp = q.get('explanation', '')
    if not 60 <= len(exp) <= 200: errors.append(f'{qid}: 解析长度 {len(exp)}，应在 60-200')
    if EXP_LETTER_RE.search(exp): errors.append(f'{qid}: 解析用字母指代选项')
    if 'code' in q and not isinstance(q['code'], str): errors.append(f'{qid}: code 类型错误')
    if q.get('stem', '').count('`') % 2: errors.append(f'{qid}: 题干反引号不成对')

n = len(qs)
cat_cnt = collections.Counter(q['category'] for q in qs)
for c, e in EXPECT_CAT.items():
    if cat_cnt[c] != e: errors.append(f'分类 {c} 题量 {cat_cnt[c]}，应为 {e}')
topic_cnt = collections.Counter(q['topic'] for q in qs)
for t, e in EXPECT_TOPIC.items():
    if topic_cnt[t] != e: errors.append(f'知识点「{t}」题量 {topic_cnt[t]}，应为 {e}')

def ratio_check(name, counter, targets, tol=0.05):
    for k, target in targets.items():
        r = counter[k] / n
        status = 'OK' if abs(r - target) <= tol + 1e-9 else 'FAIL'
        print(f'  {name}={k}: {counter[k]:3d} ({r:5.1%}, 目标 {target:.0%}±{tol:.0%}) {status}')
        if status == 'FAIL': errors.append(f'{name}={k} 占比 {r:.1%} 超出范围')

print(f'题目总数：{n}')
ratio_check('difficulty', collections.Counter(q['difficulty'] for q in qs), {1: .35, 2: .45, 3: .20})
ans = collections.Counter(q['answer'] for q in qs)
for a in range(4):
    r = ans[a] / n
    ok = .20 <= r <= .30
    print(f'  answer={a}: {ans[a]:3d} ({r:5.1%}, 目标 20%-30%) {"OK" if ok else "FAIL"}')
    if not ok: errors.append(f'answer={a} 占比 {r:.1%} 不在 20%-30%')
style = collections.Counter(q['style'] for q in qs)
print('  style 分布（参考）：' + '、'.join(f'{k} {v} ({v/n:.0%})' for k, v in style.items()))

longest = [q['id'] for q in qs if len(q['options'][q['answer']]) == max(len(o) for o in q['options'])
           and sum(len(o) == len(q['options'][q['answer']]) for o in q['options']) == 1]
r = len(longest) / n
print(f'  正确选项为唯一最长：{len(longest)} ({r:.1%}, 上限 40%) {"OK" if r <= .40 else "FAIL"}')
if r > .40: errors.append(f'正确选项最长占比 {r:.1%} 超过 40%')

neg = collections.Counter(q['category'] for q in qs if re.search(r'\*\*(不|无法|最不|不能|不是|不属于)', q['stem']))
for c in EXPECT_CAT:
    rr = neg[c] / cat_cnt[c] if cat_cnt[c] else 0
    print(f'  否定式提问 {c}: {neg[c]} ({rr:.0%}, 上限 20%)')
    if rr > .20: errors.append(f'分类 {c} 否定式提问占比 {rr:.0%} 超过 20%')

if errors:
    print(f'\n校验失败（{len(errors)} 项）：')
    for e in errors: print('  ✗', e)
    sys.exit(1)
print('\n✓ 全部校验通过')
