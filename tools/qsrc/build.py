import json, random, sys, collections
import os; sys_path_dir = os.path.dirname(os.path.abspath(__file__)); import sys; sys.path.insert(0, sys_path_dir)
from common import QUESTIONS
import q_net_os, q_web1, q_web2, q_crypto
SLUG = {
 'TCP 三次握手':'tcp-handshake','TCP 四次挥手与 TIME_WAIT':'tcp-teardown','SYN Flood':'syn-flood','TCP 与 UDP、可靠传输':'tcp-udp',
 '流量控制与拥塞控制':'flow-congestion','HTTPS 与 TLS 握手':'tls','DNS 及 DNS 攻击':'dns','HTTP 基础':'http','Cookie / Session / JWT':'cookie-jwt',
 'ARP 与 ARP 欺骗':'arp','分层模型、常见端口、ICMP、NAT':'layers-ports','DDoS 与反射放大':'ddos',
 '进程、线程、协程':'process-thread','进程间通信':'ipc','死锁':'deadlock','虚拟内存与分页':'virtual-memory','用户态与内核态':'kernel-mode',
 '缓冲区溢出及缓解措施':'bof','Linux 权限与 SUID':'linux-perm','Linux 提权':'linux-privesc','Linux 应急排查':'linux-ir','Windows 应急':'windows-ir',
 'SQL 注入':'sqli','XSS':'xss','CSRF':'csrf','SSRF':'ssrf','文件上传':'upload','文件包含与目录穿越':'lfi','命令注入':'cmdi','反序列化':'deser',
 'XXE':'xxe','越权与逻辑漏洞':'authz','同源策略、CORS、点击劫持、安全响应头':'cors-headers','WAF / IDS / IPS':'waf-ids',
 '对称与非对称加密':'sym-asym','AES 分组模式':'aes-mode','哈希与 HMAC':'hash-hmac','密码存储':'password','数字签名与证书':'signature',
 '中间人攻击与 DH 密钥交换':'dh-mitm','编码、加密、哈希的区别与重放攻击':'encode-replay'}
rng = random.Random(20261117)
topic_count = collections.Counter(q['topic'] for q in QUESTIONS)
seq = collections.Counter()
out = []
cat_order = ['network','os','web','crypto']
# 按分类分配答案位置：每 4 题一组打乱 0..3，保证每个分类内也均衡
for cat in cat_order:
    qs = [q for q in QUESTIONS if q['category']==cat]
    pos = []
    while len(pos) < len(qs):
        blk=[0,1,2,3]; rng.shuffle(blk); pos += blk
    for q, a in zip(qs, pos):
        seq[q['topic']] += 1
        opts = q['options'][:]
        correct = opts[0]
        rest = opts[1:]; rng.shuffle(rest)
        rest.insert(a, correct)
        item = {'id': f"{cat}-{SLUG[q['topic']]}-{seq[q['topic']]:03d}", 'category': cat, 'topic': q['topic'],
                'style': q['style'], 'difficulty': q['difficulty'], 'stem': q['stem']}
        if q['code']: item['code'] = q['code']
        item.update(options=rest, answer=a, explanation=q['explanation'])
        if topic_count[q['topic']] >= 3: item['tags'] = ['高频']
        out.append(item)
data = {'version':1,'updatedAt':'2026-11-17','categories':[
  {'id':'network','name':'计算机网络'},{'id':'os','name':'操作系统与 Linux'},{'id':'web','name':'Web 安全'},{'id':'crypto','name':'密码学'}],
  'questions': out}
with open(sys.argv[1],'w',encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=1)
print(len(out))
