# 德州扑克练习桌

> Texas Hold'em Practice Table — 纯前端、单机、3D 牌桌的新手练习游戏

打开就能玩，**不需要后端、不需要联网、不需要安装**。所有资源（Three.js、3D 模型、写实头像、语音与音乐合成器、荷官视频）都已打包在本仓库里。

## 在线玩

- **GitHub Pages**：<https://yuhuali1989.github.io/poker/>
- 仓库自带 `.github/workflows/pages.yml`：每次 push `main` 会自动把站点同步到 `gh-pages` 分支。
  首次只需在仓库 **Settings → Pages** 把 Source 设为 `Deploy from a branch` → `gh-pages` / `(root)` 并保存，
  之后所有更新自动发布。（GitHub 不允许 Actions 的 `GITHUB_TOKEN` 代开 Pages，所以这一步只能人工点一次。）

## 本地运行

在本目录起任意静态服务器即可（**不要**用 `file://` 直接打开，ES module 与 fetch 会被浏览器拦截）：

```bash
python -m http.server 8080
# 浏览器打开 http://localhost:8080/
```

或 `npx serve .`。也可以用原来的 Node 版 `server.js`（积分存服务端 JSON），静态版则用 `localStorage` 复刻了同一套 `/api/*` 接口。

## 功能一览

| 模块 | 说明 |
| --- | --- |
| 🃏 发牌 | `crypto.getRandomValues` + Fisher–Yates 真随机洗牌；7 选 5 牌力评估经精确枚举校验 |
| 👥 牌局 | 固定 8 人桌（你 + 7 位 AI），完整盲注 / 四轮下注 / 全下边池 / 摊牌平分；盲注每 12 手翻倍 |
| 🎲 3D 牌桌 | 离线 Three.js：绒面椭圆桌、8 座位、3D 卡牌与筹码、写实 3D 荷官 GLB、8 位牌手 3D 角色；可拖拽转视角 / 滚轮缩放 / 荷官特写 |
| 📖 教学 | 6 课新手教程（牌型、行动、起手牌、底池赔率） |
| 📊 本轮局势 | 阶段进度、底池 / 跟注额、蒙特卡洛胜率、底池赔率、听牌 outs、建议动作与建议下注额 |
| 🔍 玩家情报 | 谁先 open、每人本手动作时间线、按性格与动作推测的持牌范围；摊牌后显示真实牌型 |
| 🧠 牌手档案 | 每人最近 20 手行为落盘，算 VPIP / PFR / 3Bet / AF / WTSD / W$SD，判定人格并给出针对性压榨策略 |
| 🔊 声音 | Web Audio 合成爵士 BGM、8 人差异化动作音色、中文语音台词、英文 `All in!` 播报、荷官女声 |
| 💃 荷官 | 三位可选形象（照片 / 视频 / 动态立绘）、8 种可播放动作、点击互动、打赏 |
| 💾 存档 | 纯前端 `localStorage`：积分、战绩、排行榜、牌手档案；跨会话保留 |

### 直达参数

| 参数 | 效果 |
| --- | --- |
| `?demo=1` | 自动开局并自动行动，适合观战 |
| `?tutorial=1` | 直接打开教学 |
| `?allin=1` | 演示 ALL IN 喊话 |
| `?profiles=1` | 打开牌手档案弹窗 |
| `?face=1` | 3D 荷官特写镜头 |
| `?look=yara` / `?mode=video` / `?zoom=1` | 指定形象 / 媒体模式 / 镜头 |
| `?3d=0` | 切回 2D 经典桌 |

> 首次进入请点击一次页面（浏览器自动播放策略），音乐与语音才会响起。顶栏可分别关闭音乐 / 音效 / 3D / 局势面板 / 情报卡。

## 目录结构

```
index.html          页面结构
style.css           样式与 2D/3D 两套布局
core.js             牌堆、洗牌、牌力评估、蒙特卡洛胜率
game.js             牌局流程、AI 决策、教学、交互反馈
audio.js            Web Audio 音乐 / 音效 / SpeechSynthesis 语音
dealer.js           荷官形象、媒体模式、动作与打赏
profile.js          牌手行为指标、人格判定、压榨策略
three-scene.js      Three.js 3D 牌桌与角色场景
static-backend.js   localStorage 版 /api/* 适配层（纯前端关键）
vendor/             three.module.js / GLTFLoader / OrbitControls（离线）
models/             3D 荷官 GLB 与 8 位牌手写实头像
dealers/            三位荷官写实照片
videos/             写实荷官循环短片
```

## 技术说明

- **importmap 使用相对路径**，因此可部署在 GitHub Pages 的 `/仓库名/` 子路径下，也可放在任意子目录。
- `.nojekyll` 避免 GitHub Pages 用 Jekyll 处理带下划线的文件。
- 3D 模型加载失败或超时会自动回退到程序化 3D 备用角色，不会白屏。
- 不支持 WebGL 的环境会自动切回 2D 桌。

## 说明

牌桌中的 Yara、Siaqiu、布兰妮、Tanxuan、Dwan 等为**以名字致敬的虚构角色**，形象由 AI 生成，并非本人肖像或真实影像；游戏为纯练习用途，不涉及任何真实货币。

## 许可证

仅用于个人学习与练习。第三方库 Three.js 遵循 MIT 许可。
