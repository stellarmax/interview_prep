# 网安面试刷题

纯前端单选题刷题网页：计算机网络、操作系统与 Linux、Web 安全、密码学，共 124 题。答错的题自动进入错题集，连续答对后移出。进度只保存在浏览器的 localStorage 里。

## 目录

```
index.html            单页入口（hash 路由）
css/style.css         样式（移动优先，自动深色模式）
js/app.js             路由与页面渲染
js/quiz.js            组卷、判题、答题流程
js/store.js           localStorage 读写、迁移、导入导出
data/questions.json   题库（由 tools/qsrc 生成）
_headers              Cloudflare Pages 安全响应头（CSP 等）
tools/                题库源文件、校验脚本、自动化测试（不参与页面运行）
```

## 本地预览

```bash
python -m http.server 8000
# 打开 http://localhost:8000
```

## 修改题库

题目源在 `tools/qsrc/*.py`，每题的正确选项写在 `options[0]`，生成时自动分配答案位置。

```bash
python tools/qsrc/build.py data/questions.json   # 生成题库
python tools/validate.py                         # 按需求文档 6.7 节校验
node tools/test.mjs                              # 判题与错题集自动化测试
```

已发布题目的 `id` 不要修改：做题记录和错题集都按 id 关联。

## 部署（Cloudflare Pages）

1. 在 Cloudflare Pages 中连接本 GitHub 仓库
2. 框架预设选 None，构建命令留空，输出目录填 `/`
3. 在「自定义域名」中绑定子域名
4. 之后每次 `git push`，网站自动更新
