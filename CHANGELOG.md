# 变更日志

所有重要变更记录于此。格式参考 Keep a Changelog，版本号遵循语义化版本（本插件用 `主.次.修订`，功能修复算修订号递增）。

## [v2.0.6] - 2026-10-27

### 修复（Functional fixes）

- **子节点字段等价（P0）**：`nav` / `tabs` / `list` / `timeline` 之前只认 `items`，写 `components` 会被校验放行却渲染成空壳（v2.0.5 只修了 7 个容器、漏了这 4 个，且当时测试只覆盖被改过的 case，所以一直绿）。现抽成唯一的 `kids()` 入口，所有读子节点的代码只能走这一处；并补「子节点字段等价」回归测试，对全部接受子项的类型断言 `items` 与 `components` 产出等价 DOM。
- **围栏识别误伤（P0）**：`findBlocks` 原逻辑是「有 lang 标注命中才 true，否则掉下去嗅探内容」，于是 `lang="json"` 的配置示例、模型讲解围栏用法时贴的样例 JSON 都会被误渲染成卡片。改为「有 lang 标注必须严格等于 `dsh-fuse`；完全无标注的裸 `<pre>` 才允许内容嗅探」（标注向上取所属代码块容器，避免内部 `<pre>` 漏判）。
- **「刷新」按钮无效（P0）**：`loadThemes()` 命中缓存后直接 resolve，实测 fetch 次数恒为 1，改了 `theme.json` 点刷新无反应。现加 `force` 参数，刷新真正重拉令牌（测试断言 fetch 次数增加）。
- **`theme` 三方口径打架（P0）**：README 说可选、提示词说必填、校验器说必填且未知名报错。统一为「呈现层字段：省略或写了不认识的名字都回落 `default`，不整页拒绝」，并消除「是否报错取决于令牌加载时序」的不确定性。
- **导出 HTML 不保真（P1）**：`value` / `checked` 是 DOM property 不进 `innerHTML`，导出的表单永远是空白。现 `freezeFormState` 固化状态；导出页 `<form>` 加 `onsubmit="return false"`（无运行时 JS，否则回车刷新丢数据）；清理内部随机 `key`；文件名清洗保留空格。

### 无障碍（Accessibility）

- `tabs` 由 `<span>` + click 改为 `<button role="tab">`，支持 `←`/`→`/`Home`/`End` 键盘切换；面板 `role=tabpanel` 并**缓存复用**（切换不丢用户输入）；修掉 CSS 里那条永远命中不了的 `.fuse-tabs .tab:focus-visible` 死规则。
- 表单 `label` 与控件用 `for`/`id` 关联（`input`/`select`/`textarea`）。
- `progress` → `role=progressbar` + `aria-valuemin/max/now`；`alert` 的 `error` 用 `role=alert`、其余 `role=status`；`loading`/`skeleton` 加 `role`/`aria`；`avatar`/`chart`/`donut`/`line` 补 `role=img` + 文字替代表述；`table` 支持 `<caption>` 与表头 `scope=col`。
- 顺带保留原有做得对的：按钮用真 `<button>`、`checkbox` 用 `<label>` 包裹、`prefers-reduced-motion` 关动画。

### 性能 / 健壮性

- 外层 `mountAll` 加 80ms 去抖（流式输出每 token 不再全表扫描 + 每候选块 `JSON.parse`），保留内层 `mountOne` 的 300ms 去抖与重复挂载守卫（守卫删了会双重渲染，已用测试锁死）。
- `link` 的 `href` 白名单收紧为 `^(https?://|mailto:)`（原 `^https?:` 缺 `//`，`http:javascript:...` 可穿透）。
- `escHtml` 补单引号转义。

### 重构 / 清理

- `applyTheme` 的 25 行手写 `set(...)` 改为令牌名←取值的映射表（`DUAL_COLOR`/`DUAL_SIZE`/`SHELL`），新增令牌只加一行。
- `text` 的字号阶梯与标签映射提到常区，不再每次调用重建对象字面量。
- `index.mjs` 的 `readTheme()` 加模块级缓存；`/api/fuse` handler 加 try/catch 兜底。
- 删除 `config/theme.json` 中从未被读取的 `brand` 死数据（原声称「单一事实来源」但代码从不读），消除误导。
- `tests/make-preview.mjs` 加「仅被直接执行才落盘」守卫（原顶层 await 导致 import 即写 `docs/preview.html`）。
- `.gitignore` 补 `docs/preview.html`（生成物）。

### 文档

- 新增 `docs/components.md`：**34 个组件字段契约的单一事实来源**（之前 README 只列组件名、模型只能猜，是静默 bug 的根源）。
- 新增 `examples/`（dashboard / form / table_page 三个可直接渲染的样例）。
- README 版本号、行数、测试数、版本历史表同步更新，并指向本文件。

### 测试

- 测试 8 → **14 项**。新增回归防线：子节点字段等价、围栏识别边界、theme 可选性、刷新重新拉取令牌、导出保真、无障碍语义。

## [v2.0.5] - 2026-10-25

- **修复渲染 bug**：容器（`row`/`grid`/`col`/`card`/`section`/`form`）过去只认 `items`，用 `components` 写的嵌套会被校验放行、渲染成空壳；现在两者都认。补「嵌套组件」回归测试（基线 8 项）+ README 预览图。

## [v2.0.4] - 2026-10-25

- 插件卡片文案改走 `locale`（标题「页面渲染」），`description` 改成一句英文；功能无变更。

## [v2.0.0 – v2.0.3] - 2026-10-25

- 收敛为单一职责：删走查器 / 撤销 / 设置页 / 预检工具，重写渲染器与测试，新增 `spec.mjs`、`tests/all.mjs`。

## [v1.x] - 2026-09 及更早

- 旧版（含走查器与设置页），已冻结不再维护。
