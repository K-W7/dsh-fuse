# 组件字段契约（单一事实来源）

> 本文件是 dsh-fuse 渲染器 `lib/client.js` 接受的 **全部** 组件字段契约。
> 之前 README 只列了组件名、没说每个认哪些字段，模型只能猜 —— 这是 v2.0.5 / v2.0.6 一堆静默渲染 bug 的根因。
> **改了渲染器、增删字段，必须先同步本文件。**

一份规格 = `{ type, title?, theme?, context?, components: [...] }`，`components` 里的每个元素是一个组件对象。
整份受预算约束：组件总数（含嵌套）≤ `FUSE_MAX_NODES`、嵌套深度 ≤ `FUSE_MAX_DEPTH`，超限整份拒绝渲染（变错误卡）。

## 页面类型（根 `type`，10 种）

`login_form` / `signup_form` / `dashboard` / `settings_page` / `table_page` / `landing_page` / `profile_card` / `pricing_page` / `modal` / `form`

> **重要**：`type` 仅作语义标注与白名单校验，渲染器不会因为它不同而产出不同结构。
> 例如 `login_form` 与 `dashboard` 输出的 HTML 结构完全一致 —— 不要指望「换个 type 就自动多出表单/登录框」。
> 想要不同布局，请在 `components` 里自己组合组件。

## 通用规则

- 每个组件对象**必须**有 `type`。
- **容器组件**（见下表）的子节点写 `items` 或 `components` 完全等价，二选一即可（不要两个都写，写了也只认其中一个）。
  - v2.0.5 只给 7 个容器加了 `components` 兜底、漏了 `nav`/`tabs`/`list`/`timeline`，v2.0.6 已抽成唯一的 `kids()` 入口，从根上杜绝再犯。
- `theme` **可选**：省略或写了不认识的名字都会回落到 `default`，不会整页拒绝。
- `context`（模型用来适配语气的 `{product, audience, task}`）当前**只做类型校验**（必须是对象），渲染器不读取其内容 —— 写了不影响画面，但会多耗 token，建议省略。
- 所有文本走 `textContent`，**没有** `innerHTML` / 模板注入，模型无法借规格注入 HTML。

## 容器组件（接受 `items` 或 `components` 数组）

| 类型 | 自身可选字段 | 子项约定 |
|---|---|---|
| `page` | — | 顶层页面根（一般不直接当组件用） |
| `card` | `title` | 任意组件 |
| `grid` | `cols`（列数，默认按子项自适应） | 任意组件 |
| `row` | — | 横向排列，任意组件 |
| `col` | — | 纵向排列，任意组件 |
| `section` | `title`? | 带标题的分节，任意组件 |
| `form` | — | 表单容器；子项通常是 `input`/`select`/`textarea`/`checkbox`/`radio`/`button` |
| `nav` | `label`/`title`（容器可访问名） | 子项为字符串或 `{ text, active? }` |
| `list` | `label`/`title`（可访问名） | 子项为 `{ title, desc? }` 或任意组件 |
| `timeline` | — | 子项为 `{ title, desc?, time? }` 或任意组件 |
| `tabs` | — | 子项为 `{ label, content? / items? / components? }`，三种写法等价；面板内容渲染为 `tabpanel` |

> 注意根 `type: "form"` 与组件 `form` 是两回事：根 `type` 是「页面类型」，**不会**自动生成 `<form>` 元素；
> 要真有表单交互，必须再放一个 `{ type: "form", items: [...] }` 组件。

## 叶子组件字段

| 类型 | 字段 | 说明 |
|---|---|---|
| `header` | `title`, `subtitle` | 页面/区块标题 |
| `footer` | `text` | 页脚文字 |
| `hero` | `title`, `subtitle`, `actions`（按钮组件数组） | 主视觉区 |
| `text` | `content`/`text`, `size`, `center` | 字号 `size ∈ {h1,h2,h3,body,bodyLg,caption,muted}`；**`muted` 是颜色不是字号**，会落到 `caption` 字号 + 静音色 |
| `badge` | `text`/`content`, `tone` | 状态徽标，`tone ∈ {success,warning,error,info,neutral}` |
| `stat` | `value`, `label` | 指标卡 |
| `table` | `columns`（表头数组）, `rows`/`items`（行数组，每行是单元格数组）, `caption`? | 带 `<caption>` 与表头 `scope=col` |
| `divider` | — | 分隔线 |
| `avatar` | `name`, `color`? | 首字母头像，`role=img` + `aria-label` |
| `chart` | `kind`, `data` | `kind ∈ {bars,donut,line,area}`，`data:[{label,value}]`；图表带 `role=img` + 文字摘要 |
| `steps` | `steps`（步骤数组）, `current` | 步骤条，`current` 为数字索引 |
| `loading` | `label`? | 加载态，`role=status` |
| `skeleton` | `lines`?, `variant`? | 骨架屏占位，`aria-hidden` |
| `progress` | `value`, `max`?, `label`?, `tone`?, `text`? | 进度条，`role=progressbar` + `aria-valuemin/max/now` |
| `alert` | `title`, `content`/`text`, `tone` | `tone ∈ {success,warning,error,info}`；`error` 用 `role=alert`（打断式），其余 `role=status` |
| `code` | `code`/`content`, `lang` | 代码块（注意：这是**渲染出的**代码展示组件，与「围栏语言 dsh-fuse」无关） |
| `input` | `label`, `placeholder`, `inputType`?, `action`? | `<input>`；`label` 通过 `for`/`id` 关联控件 |
| `select` | `label`, `options`（字符串数组或 `{label}` 数组）, `selected` | **`selected` 是数字索引**（不是值匹配），`options[i]` 被选中 |
| `textarea` | `label`, `placeholder`, `action`? | 多行输入 |
| `checkbox` | `label`, `checked`? | 勾选框 |
| `radio` | `label`, `checked`? | 单选框 |
| `button` | `label`/`text`, `tone`?, `style`?, `action`?, `full`?, `small`? | 真 `<button>`，`action` 为自定义事件名 |
| `link` | `label`/`text`, `href` | `href` 仅允许 `https://`、`http://`、`mailto:`（已收紧 `//` 校验），其余被丢弃 |

## 交互约定

- 工具栏「刷新」会真正重新拉取 `config/theme.json` 的令牌（v2.0.5 命中缓存后不再请求，是 bug）。
- 「导出 HTML」产出自包含单页：会固化用户填写的 `value`/`checked`（DOM property，不进 `innerHTML`），并给 `<form>` 加 `onsubmit="return false"` 防止导出页回车刷新丢数据；导出产物不含内部随机 `key`。
- `tabs` 用 `<button role="tab">` + 键盘可达（`←`/`→` 切换、`Home`/`End` 跳首尾），面板 `role=tabpanel` 且**缓存复用**（切换不丢用户输入）。

## 校验拒绝（变错误卡）的情形

- 不是 JSON 对象 / `components` 非数组或为空
- `type` 不在 10 种页面类型内
- 组件数超 `FUSE_MAX_NODES` 或嵌套超 `FUSE_MAX_DEPTH`
- 子组件 `type` 不在 37 种组件白名单内
- 容器组件既无 `items` 也无 `components`
- `tabs` 项的 `content`/`items` 不是数组
- `context` 存在但不是对象

> `theme` 写错**不再**拒绝（回落 default）。这条与早期版本/旧提示词不同，以本文件与 `lib/client.js` 当前实现为准。
