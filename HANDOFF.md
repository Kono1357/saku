# 交接文档 · 朔的世界（OC 平行世界模拟器）

> **你在新设备上，手上只有这个公开仓库和一个密码。**
> 按下面的「第一步」做完，你就能拿到完整源码并继续改。

---

## 第一步 · 从零恢复项目（换设备必做）

仓库里**没有明文源码**，只有加密产物。密码是唯一的钥匙。

```bash
mkdir saku && cd saku

# ① 取解密脚本 + 加密源码包
curl -O https://kono1357.github.io/saku/boot.js
curl -O https://kono1357.github.io/saku/saku-src.enc.js

# ② 解密（只要 node，不需要装任何库）
node boot.js 'Saku-Yueliang-2026-X7' saku-src.enc.js

# ③ 解压
unzip -o saku-src.zip -d .
#   没有 unzip 就用： python3 -m zipfile -e saku-src.zip .
```

做完你会得到 34 个文件，其中包括 `game/maze.html`（桌游源码）和
`restore.py`（以后换设备可以直接用它，不必再手动跑 boot.js）。

**以后换设备的等价命令**（拿到 restore.py 之后）：

```bash
python3 restore.py --yes          # 只报告会还原什么
python3 restore.py --yes --force  # 真的还原并可覆盖
```

---

## 第二步 · 装环境

| 需要 | 干什么用 | 检查 |
|---|---|---|
| **python3** | 构建、部署、恢复 | `python3 -V` |
| **node** | 加密、跑测试 | `node -v` |
| **jsdom** | 只给测试用 | `cd tests && npm install jsdom` |

密码统一用环境变量传：`export SAKU_PW='Saku-Yueliang-2026-X7'`

---

## 项目结构

```
game/maze.html          桌游《一页迷宫》—— 单文件 HTML/CSS/JS，约 4300 行  ← 主要改这个
shell/home.html         主模拟器页面（日记 / 日历 / 桌游联动）
shell/build_home.py     由 home.html 生成两个版本的 index.html
engine/saku-engine.js   主模拟器的核心引擎（时段推算 / 情绪 / 事件）
ascii/                  场景 ASCII 美术生成
saku_word.json          全部文本内容池（55 个池，约 800 KB）
pixel/encrypt_js.js     加密任意文件 → window.XXX_ENC = {v,salt,iv,ct,tag}
pixel/deploy_gh.py      推送到 GitHub
pixel/build_src.py      重建源码包 saku-src.enc.js
restore.py              从仓库拉回整个项目
tests/                  回归测试（见下）
```

### 桌游是怎么发布的

```
game/maze.html  --加密-->  maze.enc.js  --上传-->  GitHub Pages
                                                  ↓
主页面 index.html 解密 maze.enc.js，把它塞进 iframe 的 srcdoc 里运行
```

桌游跑在 **iframe** 里，靠 `postMessage` 和主页面双向通信：

- 主页面 → 桌游：`{type:'maze_mood', payload:{level,v,period,sick,sleepDebt}}`（朔当前情绪）
- 桌游 → 主页面：`{type:'maze_result', payload:[...]}`（整局记录，日历/日记用）
- 桌游 → 主页面：`{type:'maze_close'}`（顶部「← 返回」被点击）

---

## 第三步 · 改代码 → 构建 → 部署

**顺序不能错。** 改完 `game/maze.html` 之后：

```bash
cd saku

# 1. 重建主页面两个版本（内含 <style> 括号平衡检查，不平衡会拒绝构建）
python3 shell/build_home.py

# 2. 把桌游加密成发布产物
node pixel/encrypt_js.js game/maze.html standalone/deploy/maze.enc.js SAKU_MAZE_ENC

# 3. 重建源码包（会把当前源码重新打进 saku-src.enc.js，别忘了！）
python3 pixel/build_src.py

# 4. 推送
cd pixel && python3 deploy_gh.py
```

### GitHub token

`deploy_gh.py` 按这个顺序找 token，任选一种即可：

1. 环境变量 `GH_TOKEN`（或 `GITHUB_TOKEN`）
2. `<项目根>/.ghtok`
3. `~/.ghtok`
4. `/tmp/.ghtok`

```bash
echo 'ghp_你的token' > ~/.ghtok && chmod 600 ~/.ghtok
```

### 加密到底做了什么

`pixel/encrypt_js.js` 把任意文件变成这样一行 JS：

```js
window.SAKU_XXX_ENC = {v:1, salt, iv, ct, tag};   // 全是 base64
```

算法：**PBKDF2-SHA256（250000 轮）→ AES-256-GCM**。
密码默认 `Saku-Yueliang-2026-X7`，可用 `SAKU_PW` 环境变量覆盖。

主页面在部署版里做的是反过来的一套：拿到 `SAKU_ENC` → 用用户输入的密码解密 →
得到明文 JSON → 交给引擎。所以**密码错了就解不出来，仓库公开也读不到内容**。

桌游那一份多一步：解密得到的是**整个 HTML 文件**，塞进 iframe 的 `srcdoc` 里运行。

### 部署后要等

GitHub Pages 构建约 **5 分钟**。验证方法 —— 把线上文件拉下来解密，
和本地**逐字节比对**：

```bash
node -e "
const fs=require('fs'),crypto=require('crypto');
const js=fs.readFileSync('线上拉下来的 maze.enc.js','utf8');
const o=JSON.parse(js.slice(js.indexOf('{'),js.lastIndexOf('}')+1));
const k=crypto.pbkdf2Sync('Saku-Yueliang-2026-X7',Buffer.from(o.salt,'base64'),250000,32,'sha256');
const d=crypto.createDecipheriv('aes-256-gcm',k,Buffer.from(o.iv,'base64'));
d.setAuthTag(Buffer.from(o.tag,'base64'));
const out=Buffer.concat([d.update(Buffer.from(o.ct,'base64')),d.final()]);
console.log('一致:', out.equals(fs.readFileSync('game/maze.html')));
"
```

---

## 本地调试（改桌游最快的方式，不用加密不用部署）

**改桌游时不要每次都走"加密→上传→等 5 分钟"** —— 本地起了服务直接刷新就能看。

```bash
cd <项目根>
python3 server.py &          # 监听 0.0.0.0:8088
```

然后手机上打开 **http://127.0.0.1:8088/**

- **本地版不需要密码** —— 数据走明文 `/saku_word.json`（部署版才用加密数据）
- 改 `game/maze.html` **直接刷新页面**就生效，不用加密、不用部署
- 桌游在本地版是装在 iframe 里的 `/game/maze.html`，改完刷新即可

一条命令验证整站是不是真的跑通了：

```bash
cd tests && node local.test.js      # 需要 server.py 正在跑
```

它会从 `8088` 真实加载整个站点，逐项验证：数据加载 → 日记渲染 →
桌游 iframe 装载 → 开局构筑 → 进入正式牌局 → 资源栏 9 项 → 深渊轨道 13 格。

**常见问题**：手机打不开 `127.0.0.1:8088` —— 那是"本地"的意思，指的是**跑服务的那台机器**。
手机和服务器在同一个网络里时，要用服务器的局域网 IP（`ip addr` 查）。

---

## 测试（改完必跑）

```bash
cd tests
node rules.test.js        # 467 条规则断言，逐条对着规格核
node playthrough.test.js  # 端到端：真实回合循环打完整局到 Boss 和结局
node fuzz.test.js         # 随机 30 局 / 500+ 回合，每回合做计数器对账
node balance.js           # 平衡模拟，看胜率（可选）
```

**这三套测试是这个项目唯一的「记忆」。**
新工作区没有之前的对话历史，但这 467 条断言覆盖了历次踩过的坑 ——
改完老实跑一遍，能拦住绝大多数回归。

---

## 四条踩过的坑（都是真实事故，务必交代）

### 1. 不要动 `<style>` 块里的历史遗留 JS

`shell/home.html` 和 `game/maze.html` 的 `<style>` 块里混着一些**永远不会执行**的
旧 JS 副本（CSS 解析器会静默跳过）。

删改它们时极容易连带删掉一两个 `}` —— **CSS 括号一不平衡，解析器会把它之后的
所有规则当成嵌套内容吞掉，整个排版当场崩掉。**

- 改这两个文件时，**只动 `</style>` 之后的内容**
- `build_home.py` 已有括号平衡检查；改完务必看它有没有报错

### 2. 所有定时器回调都要带令牌守卫

`setTimeout` 回调在触发时，那一局可能已经结束、甚至已经开了新的一局。
无保护的旧回调会**打到新局上** —— 表现是「新局刚开局就被判败北」「计数器全部停摆」。

```js
var ses = SESSION;                       // 每开一局 +1
setTimeout(function(){
  if(ses !== SESSION || !S || S.phase === 'over') return;   // 换局了就作废
  ...
}, 700);
```

结算链另有一套 `SETTLE_TOKEN`。同理。

### 3. 看门狗判定「卡死」时，`S.settleActive` 属于正常等待

结算链每个房间要播约 1.1 秒动画。如果看门狗把「正在播动画」误判成卡死，
它会强行结束回合、`SETTLE_TOKEN++`，**后面的房间全被跳过** ——
被跳过的是迷宫的话，深渊永远不涨，直接卡关。

判据要用心跳，不是「有没有挂标志」：

```js
S.settleTick = Date.now();               // settleStep 每步打一次
var waiting   = S.settleActive || S.settlePending || S.turnPendingEnd || popOpen();
var chainDead = S.settleActive && (Date.now() - (S.settleTick || 0) > 5000);
```

### 4. 容器里可能没有 curl

脚本一律用 Python 的 `urllib`，别依赖 curl。

---

## 其他要点

- **线上地址**：https://kono1357.github.io/saku/
- **解密密码**：`Saku-Yueliang-2026-X7`（可用 `SAKU_PW` 覆盖）
- **可调数值**：`game/maze.html` 顶部有一个 `CFG` 配置块（回合上限、小怪要求、
  困难模式各项 HP），改常用数值只动那一处
- **存档兼容**：`normalizeSave()` 负责给旧版本存档补字段。
  以后再加 `S` 的字段，**记得同时加进 `SAVE_DEFAULTS`**，否则老存档会在结算里抛错
- **容器时区是 UTC**，显示北京时间用的是 `timezone(timedelta(hours=8))`

---

## 和设备相关的能力（DSH 容器里才有）

如果新设备也在 DSH 容器里，可以用 `/app/*` 接口直接操作那台 Android 手机
（读屏、点按、截屏、通知等）。手机端调试尤其有用 ——
**「屏幕操作权限」在 DSHA 的「配置」页打开之后，可以截图看实际渲染效果**，
很多排版类问题一眼就能定位。

容器里没有浏览器，只有 jsdom —— **jsdom 没有排版引擎**，
所以 CSS 层面的问题（字号撑破布局、元素被挤出屏幕、被遮挡）**测不出来**，
必须靠真机截图或用户描述来定位。
