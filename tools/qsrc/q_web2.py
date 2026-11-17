from common import Q
# 注意：部分 payload 用 \x 转义书写，避免本地杀毒软件按特征误删源文件；生成的 JSON 内容不受影响。

Q('web', '文件上传', 'scenario', 3,
  '网站使用 Apache 且允许上传 `.htaccess` 文件。攻击者先上传了如下内容的 .htaccess，又上传了 `shell.jpg`，结果会怎样？',
  ['该目录下的 shell.jpg 会被当作 PHP 脚本执行', '这个 .htaccess 只会改变 Apache 的访问日志格式', '只有文件名中包含 php 的图片才会被解析执行', '必须重启 Apache，这条配置才会生效'],
  '.htaccess 是 Apache 的目录级配置文件，在 AllowOverride 允许时即时生效，无需重启。这条指令让当前目录下的 .jpg 按 PHP 解析，图片马就变成了 Webshell。防御方法：禁止上传配置文件、关闭 AllowOverride、上传目录禁止执行脚本。Nginx 不支持 .htaccess，类似的风险是 .user.ini。',
  code='AddType application/x-httpd-\x70hp .jpg')

W6 = '文件包含与目录穿越'
Q('web', W6, 'concept', 2,
  'PHP 代码把 GET 参数 file 直接传给了 `include()`，想读取 config.php 的源码而不是执行它，应使用哪个伪协议？',
  ['`php://filter/convert.base64-encode/resource=config.php`', '`php://input`', '`data://text/plain;base64,...`', '`phar://upload/x.jpg/shell`'],
  'php://filter 先把文件内容 Base64 编码，include 拿到的只是一串字符而不是 PHP 代码，所以不会执行，解码后就得到源码。php://input 读取 POST 正文、data:// 直接嵌入代码，两者都用于执行代码，且需要开启 allow_url_include；phar:// 用于访问归档内的文件，还可能触发反序列化。')
Q('web', W6, 'defense', 2,
  '文件下载接口把 `/var/files/` 与用户传入的 filename 拼接成路径。以下哪种校验方式最可靠？',
  ['先把路径规范化为真实的绝对路径，再检查它是否仍位于 /var/files/ 下', '把 filename 中出现的 ../ 全部替换为空字符串', '检查 filename 是否以 .pdf 结尾', '检查 filename 中是否包含 /etc/passwd'],
  '直接替换 ../ 会被 ....// 绕过，替换后正好剩下 ../，还有 URL 编码等变形。正确做法是用 realpath 等函数解析出真实路径（包括符号链接），再判断是否落在允许的目录内。后缀检查可以通过构造合法后缀绕过；只查 /etc/passwd 更是挂一漏万。更好的方案是用文件 ID 映射，不让用户传路径。')

W7 = '命令注入'
Q('web', W7, 'concept', 1,
  '后端执行 `ping -c 1 <用户输入>`，以下哪个输入**不能**拼接出额外执行的命令？',
  ['`127.0.0.1 # whoami`', '`127.0.0.1; whoami`', '`127.0.0.1 && whoami`', '`127.0.0.1 | whoami`'],
  '在 shell 中，分号表示顺序执行，&& 在前一条成功后执行，管道符把输出交给下一条命令，三者都会执行 whoami。# 之后的内容是注释，whoami 会被忽略。此外还有 ||、换行符、命令替换和反引号等拼接方式。根本防御是不经过 shell 调用命令，而不是用黑名单过滤这些字符。')
Q('web', W7, 'concept', 2,
  'Python 中用 `subprocess.run(["ping", "-c", "1", host], shell=False)` 调用命令，为什么能防止命令注入？',
  ['参数列表直接交给程序，不经过 shell 解析，分号、管道符只是普通字符', 'shell=False 会自动转义 host 中的所有特殊字符', 'shell=False 时 Python 会先检查 host 是否为合法 IP', '列表形式会以低权限用户的身份运行命令'],
  'shell=False 时 Python 直接调用 execve，把列表中的每一项作为独立参数交给 ping，没有 shell 参与，也就不存在分号、管道符、&& 的语义，注入的字符只会成为 ping 的一个奇怪参数。它不做转义、不校验格式、也不降权。仍需注意参数注入：host 以 - 开头时可能被当成选项。')
Q('web', W7, 'scenario', 3,
  '某命令注入点过滤了空格，攻击者想执行 `cat /etc/passwd`。以下哪种写法能在 bash 中绕过？',
  ['`cat\x24{IFS}/etc/passwd`', '`cat%00/etc/passwd`', '`cat./etc/passwd`', '`cat\\t/etc/passwd`'],
  'IFS 是 bash 的内部字段分隔符，默认包含空格、制表符和换行，展开后起到空格的作用；类似的还有加位置参数的写法、重定向符和花括号写法。%00 是空字节，会截断字符串；cat. 会被当成一个不存在的命令名；反斜杠 t 在 bash 中只是转义了字母 t，并不是制表符。')

W8 = '反序列化'
Q('web', W8, 'concept', 1,
  'PHP 反序列化漏洞中，以下哪个魔术方法会在 `unserialize()` 恢复对象时被自动调用？',
  ['`__wakeup()`', '`__construct()`', '`__toString()`', '`__invoke()`'],
  'unserialize 恢复对象时会自动调用 __wakeup（PHP 7.4 起若定义了 __unserialize 则优先调用它），对象销毁时调用 __destruct，它们是利用链的常见起点。反序列化不会调用 __construct；__toString 在对象被当作字符串时触发，__invoke 在对象被当作函数调用时触发，常作为利用链的中间环节。')
Q('web', W8, 'scenario', 2,
  '某系统登录后 Cookie 中出现 `rememberMe=...` 字段，安全通告指出它存在 Shiro-550 漏洞。该漏洞的成因是？',
  ['rememberMe 用硬编码的默认 AES 密钥加密序列化数据，攻击者可构造恶意对象', 'rememberMe 的值没有签名，攻击者修改其中的用户名就能直接登录', 'Shiro 对 rememberMe 使用 MD5 哈希，攻击者可以用彩虹表还原出用户密码', 'Shiro 在写日志时解析 rememberMe，触发了 JNDI 远程类加载'],
  'Shiro 1.2.4 及以前，rememberMe 的生成过程是 Java 序列化、AES 加密、Base64 编码，而 AES 密钥默认硬编码在源码中。攻击者用已知密钥加密恶意的序列化数据，服务端解密后反序列化，配合 CommonsCollections 等利用链即可 RCE。修复要升级并更换随机密钥。JNDI 远程类加载是 Log4Shell 的特征。')
Q('web', W8, 'concept', 2,
  'Log4Shell（CVE-2021-44228）漏洞的成因是？',
  ['Log4j2 记录日志时会解析其中的 JNDI 查找表达式，从远程加载恶意类', 'Log4j2 写日志文件时没有校验权限，可以覆盖服务器上的任意文件', 'Log4j2 的日志文件可以通过 Web 直接访问，泄露了敏感信息', 'Log4j2 使用了弱随机数生成器，攻击者可以预测会话 ID'],
  'Log4j2 的 Lookup 功能会解析日志内容中的查找表达式，其中 JNDI Lookup 会访问攻击者的 LDAP 或 RMI 服务，加载并执行远程类。只要用户可控的字符串（如 User-Agent、用户名）被写进日志就能触发。它与日志文件权限、访问路径和随机数都无关。修复方法是升级到 2.17 及以上，或移除 JndiLookup 类。')

W9 = 'XXE'
Q('web', W9, 'scenario', 1,
  '服务端使用默认允许外部实体的 XML 解析器，解析如下内容并把 name 的值回显到页面。会造成什么后果？',
  ['页面回显出服务器上 /etc/passwd 的内容', '浏览器执行 XML 中的脚本，形成 XSS', '服务器上的 /etc/passwd 文件被解析器删除', '解析器忽略 DOCTYPE，原样输出实体引用'],
  '外部实体 x 用 SYSTEM 引用本地文件，解析器展开实体引用时读取 /etc/passwd 并替换进 name，回显后文件内容就泄露了。XXE 还能用 http:// 实体做 SSRF、用嵌套实体做拒绝服务。它不会让浏览器执行脚本，也不能删除文件；只有禁用外部实体的解析器才会不展开实体。',
  code='\x3c!DOCTYPE r [\n  \x3c!ENTITY x SYSTEM "file:\x2f\x2f/etc/passwd">\n]>\n\x3cr>\x3cname>&x;\x3c/name>\x3c/r>')
Q('web', W9, 'defense', 2,
  '修复 Java 应用中的 XXE 漏洞，最有效的做法是？',
  ['在解析器上禁用 DTD 和外部实体，例如开启 disallow-doctype-decl', '在 XML 内容中过滤 `\x3cscript>` 标签', '把提交 XML 的接口改为 HTTPS 传输', '对 XML 内容做 Base64 编码之后再解析'],
  'XXE 的根源是解析器处理了攻击者定义的 DTD 和外部实体，最有效的修复是在解析器层面关闭，例如给 DocumentBuilderFactory 开启 disallow-doctype-decl，或关闭 external-general-entities。过滤 script 针对的是 XSS；HTTPS 只保护传输；Base64 解码之后照常解析。也可以改用 JSON 等不支持实体的格式。')

W10 = '越权与逻辑漏洞'
Q('web', W10, 'scenario', 1,
  '用户 A 访问 `/api/order?id=1001` 查看自己的订单，把 id 改成 1002 后看到了用户 B 的订单。这属于什么漏洞？',
  ['水平越权', '垂直越权', 'CSRF', 'SQL 注入'],
  '同一权限级别的用户访问到了彼此的数据，是水平越权，也叫 IDOR。垂直越权是低权限用户执行了高权限操作，例如普通用户调用管理员接口；CSRF 是借受害者身份发请求；这里只是改了一个合法的 ID，没有注入 SQL 语法。修复要在服务端校验订单是否属于当前登录用户。')
Q('web', W10, 'defense', 2,
  '防御水平越权，以下哪种做法最有效？',
  ['服务端根据会话中的用户身份，校验所请求资源的归属', '把订单 ID 改成随机 UUID，让攻击者猜不到', '在前端隐藏其他用户订单的入口和链接', '对请求参数做 Base64 编码后再传输'],
  '越权的根源是服务端只信任客户端传来的 ID，没有检查「这个资源属于谁」。正确做法是从会话中取出当前用户，查询时带上用户条件或比对归属。UUID 只能增加猜测难度，一旦 ID 通过日志、分享链接泄露照样越权；隐藏前端入口和编码参数都挡不住直接构造请求。')
Q('web', W10, 'scenario', 2,
  '测试电商支付流程时，以下哪个现象最能说明存在业务逻辑漏洞？',
  ['把购买数量改为 -1 后，订单总价变成负数并成功提交', '修改请求中的 Cookie 后，接口返回 401 未登录', '并发提交同一订单时，第二个请求返回「订单已支付」', '把价格字段改为 0.01 后，服务端仍按商品原价扣款'],
  '业务逻辑漏洞是指代码按设计流程正常执行，却没有校验业务规则。数量为负导致总价为负，说明服务端信任了客户端提交的数量，可能被用来抵扣金额。修改 Cookie 后返回 401、重复支付被拒绝、服务端忽略客户端价格，都是正确防护的表现。还应关注并发下的余额扣减和优惠券重复使用。')

W11 = '同源策略、CORS、点击劫持、安全响应头'
Q('web', W11, 'scenario', 3,
  '某接口会把请求中的 Origin 原样反射到响应头中，响应头如下。这会导致什么问题？',
  ['任意网站都能带着用户的 Cookie 调用该接口并读取响应', '只有同源页面能读取响应，因此没有安全问题', '浏览器会拒绝所有跨域请求，导致功能无法使用', '攻击者可以借此在目标站点的页面上执行任意 JavaScript'],
  '允许携带凭证时，浏览器要求 Allow-Origin 必须是具体的源而不能是 *，于是有的开发者直接反射 Origin，结果任何恶意网站发起带 Cookie 的请求都能读到响应，窃取用户数据。它不会让脚本在目标站点执行，那是 XSS。修复时要用白名单精确匹配 Origin，并警惕 null 源和后缀匹配的错误。',
  code='Access-Control-Allow-Origin: https://evil.example\nAccess-Control-Allow-Credentials: true')
Q('web', W11, 'defense', 1,
  '以下哪个响应头用于防御点击劫持？',
  ['`X-Frame-Options: DENY`', '`X-Content-Type-Options: nosniff`', '`Strict-Transport-Security: max-age=31536000`', '`Access-Control-Allow-Origin: *`'],
  '点击劫持把目标页面放进透明的 iframe，诱导用户点击。X-Frame-Options: DENY 禁止页面被任何站点嵌入，现代写法是 CSP 的 frame-ancestors。nosniff 阻止浏览器猜测 MIME 类型；HSTS 强制使用 HTTPS；Allow-Origin 用于 CORS，设置为 * 反而放宽了跨域读取。')

W12 = 'WAF / IDS / IPS'
Q('web', W12, 'concept', 1,
  '关于 IDS 与 IPS 的区别，以下说法正确的是？',
  ['IDS 通常旁路部署、只检测告警，IPS 串联部署、可以实时阻断', 'IDS 串联部署、可以实时阻断，IPS 旁路部署、只负责检测告警', 'IDS 只能检测 Web 攻击，IPS 只能检测网络层攻击', 'IPS 只是 IDS 的旧称，两者的功能完全相同'],
  'IDS 通过端口镜像拿到流量副本旁路分析，发现攻击只告警，不影响业务；IPS 串接在流量路径上，可以直接丢弃恶意报文，但误报会影响正常业务，故障时也可能断网。两者检测的协议范围都很广，不按 Web 或网络层划分；IPS 是在 IDS 基础上增加了阻断能力。')
Q('web', W12, 'scenario', 3,
  'WAF 用正则匹配 `union select`（中间为空格）来拦截注入。以下哪种 payload 最可能绕过它，同时仍能被 MySQL 正确执行？',
  ['`union/**/select`', '`\x3c!--union select-->`', '`MD5(union select)`', '`uni on sel ect`'],
  'MySQL 把 /**/ 注释当作空白，所以 union/**/select 能正常执行，而只匹配空格的正则会漏掉。类似手法还有大小写混写、内联注释、换行代替空格、分块传输等。HTML 注释不是 SQL 语法，且仍包含被拦截的原文；套上 MD5 函数后语句不再合法；把关键字拆开 MySQL 也无法识别。WAF 只能作为辅助防线。')
