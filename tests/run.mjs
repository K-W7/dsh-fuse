// dsh-fuse v2.0 测试：每个用例一个独立进程跑（jsdom 与测试编排共进程时会互相等，实测挂起）。
// 主进程只用 execFileSync 依次拉起自己；子进程跑完一个用例就 process.exit。
//
// 覆盖：
//   ① 词汇表同步：spec.mjs（宿主提示词）↔ lib/client.js（浏览器白名单）
//   ② 渲染器：合法规格 / 工具栏 / 宽度档 / 流式骨架屏 / 流式结束升级错误卡 / 非法规格
//   ③ 令牌对比度：theme.json 两套主题正文 WCAG ≥ 4.5
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { JSDOM, VirtualConsole } from 'jsdom'

import {
  FUSE_PAGE_KINDS,
  FUSE_COMPONENT_TYPES,
  FUSE_CONTAINER_TYPES,
  FUSE_MAX_NODES,
  FUSE_MAX_DEPTH,
  buildFuseSectionText,
  summarizeTheme,
} from '../spec.mjs'

const clientSrc = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const themeConfig = JSON.parse(fs.readFileSync(new URL('../config/theme.json', import.meta.url), 'utf8'))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const block = (body, lang = 'dsh-fuse') => `<div class="md-code-block" data-lang="${lang}"><div class="md-code-block__header">${lang}</div><pre>${body}</pre></div>`

// 导航在 jsdom 里未实现：导出用例里 a.click() 触发下载会被 jsdom 报 "Not implemented: navigation"。
// 真实浏览器里这是正常下载行为，与本仓库的渲染逻辑无关，故在此屏蔽该噪声（真实错误仍透出）。
const silentNav = new VirtualConsole()
silentNav.on('jsdomError', (e) => {
  if (e && /navigation \(except hash changes\)/.test(String(e.message))) return
  console.error(e)
})

function boot(html) {
  const dom = new JSDOM(`<!doctype html><html><body><div class="conversation">${html}</div></body></html>`, { runScripts: 'outside-only', virtualConsole: silentNav })
  const { window } = dom
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  let fetchCount = 0
  window.fetch = () => { fetchCount++; return Promise.resolve({ ok: true, json: () => Promise.resolve({ themes: themeConfig.themes }) }) }
  // jsdom 的 Blob 读不回文本，用替身记录构造入参，以便断言导出的 HTML
  let exported = null
  window.Blob = class { constructor(parts) { exported = String(parts[0]) } }
  window.URL.createObjectURL = () => 'blob:fuse-test'
  window.URL.revokeObjectURL = () => {}
  let plugin = null
  window.__ModuleLoader__ = { load: ({ factory }) => { plugin = factory(() => ({})) } }
  window.eval(clientSrc)
  const dispose = plugin.apply({ sessions: { current: () => null }, effect: (fn) => fn() })
  return {
    document: window.document,
    close: () => { dispose?.(); window.close() },
    fetchCount: () => fetchCount,
    exportedHtml: () => exported,
  }
}

/** DOM 结构指纹：tag + class + 文本，忽略随机的 id / aria-* 引用 */
const shape = (root) => Array.from(root.querySelectorAll('*'))
  .map((n) => `${n.tagName.toLowerCase()}${n.className ? '.' + String(n.className).trim().split(/\s+/).join('.') : ''}=${(n.textContent || '').trim()}`)
  .join('|')

const toolbarBtn = (document, label) => [...document.querySelectorAll('.fuse-toolbar button')].find((b) => b.textContent === label)

const grabArray = (name) => {
  const m = clientSrc.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\]`))
  assert.ok(m, `client.js 里找不到 const ${name}`)
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}
const grabNumber = (name) => {
  const m = clientSrc.match(new RegExp(`const ${name} = (\\d+)`))
  assert.ok(m, `client.js 里找不到 const ${name}`)
  return Number(m[1])
}

const cases = {
  '词汇表同步': () => {
    assert.deepEqual(grabArray('PAGE_KINDS'), FUSE_PAGE_KINDS)
    assert.deepEqual(grabArray('COMPONENT_TYPES'), FUSE_COMPONENT_TYPES)
    assert.deepEqual(grabArray('CONTAINER_TYPES'), FUSE_CONTAINER_TYPES)
    assert.equal(grabNumber('MAX_NODES'), FUSE_MAX_NODES)
    assert.equal(grabNumber('MAX_DEPTH'), FUSE_MAX_DEPTH)
    for (const type of FUSE_COMPONENT_TYPES) assert.ok(clientSrc.includes(`case '${type}'`), `渲染器缺少 case '${type}'`)
    const text = buildFuseSectionText(summarizeTheme(themeConfig))
    for (const kind of FUSE_PAGE_KINDS) assert.ok(text.includes(kind), `提示词缺少页面类型 ${kind}`)
    for (const type of FUSE_COMPONENT_TYPES) assert.ok(text.includes(type), `提示词缺少组件 ${type}`)
    assert.ok(text.includes(String(FUSE_MAX_NODES)) && text.includes(String(FUSE_MAX_DEPTH)))
  },

  '嵌套组件': async () => {
    // 回归：容器（row/grid/col/card/section/form/page）过去只认 node.items，
    // 而校验器认 items ?? components —— 用 components 写的嵌套会被校验放行、渲染成空壳。
    const spec = {
      type: 'dashboard',
      title: '嵌套',
      theme: 'default',
      components: [
        { type: 'row', components: [
          { type: 'stat', value: '1,284', label: '今日新增' },
          { type: 'stat', value: '96.2%', label: '任务成功率' },
        ] },
        { type: 'grid', cols: 2, components: [
          { type: 'card', title: '月度目标', components: [{ type: 'progress', label: '完成度', value: 68, max: 100 }] },
          { type: 'card', title: '近 5 日', components: [{ type: 'chart', kind: 'bars', data: [{ label: '一', value: 12 }, { label: '二', value: 18 }] }] },
        ] },
      ],
    }
    const { document, close } = boot(block(JSON.stringify(spec)))
    await wait(80)
    assert.equal(document.querySelectorAll('.fuse-row .fuse-stat').length, 2, 'row 里的 stat 应渲染')
    assert.equal(document.querySelector('.fuse-row .fuse-stat .v')?.textContent, '1,284')
    assert.ok(document.querySelector('.fuse-grid .fuse-card-box'), 'grid 里的 card 应渲染')
    assert.ok(document.querySelector('.fuse-grid .fuse-progress .fill'), 'card 里的 progress 应渲染')
    assert.equal(document.querySelectorAll('.fuse-chart .bar').length, 2, 'card 里的 chart 柱应渲染')
    assert.equal(document.querySelectorAll('.fuse-error').length, 0)
    close()
  },

  '合法渲染': async () => {
    const spec = {
      type: 'dashboard',
      title: '运营看板',
      theme: 'default',
      components: [
        { type: 'stat', value: '1,284', label: '今日新增' },
        { type: 'progress', label: '月度目标', value: 68, max: 100 },
        { type: 'timeline', items: [{ time: '09:00', title: '上线', desc: '灰度 10%' }] },
        { type: 'code', lang: 'bash', content: 'npm test' },
      ],
    }
    const { document, close } = boot(block(JSON.stringify(spec)))
    await wait(80)
    assert.ok(document.querySelector('.fuse-card'), '应渲染预览卡')
    assert.equal(document.querySelector('.fuse-title')?.textContent, '运营看板')
    assert.equal(document.querySelector('.fuse-stat .v')?.textContent, '1,284')
    assert.ok(document.querySelector('.fuse-progress .fill'), 'progress 应渲染填充条')
    assert.ok(document.querySelector('.fuse-timeline .item'), 'timeline 应渲染条目')
    assert.equal(document.querySelector('.fuse-code pre')?.textContent, 'npm test')
    assert.equal(document.querySelectorAll('.fuse-error').length, 0)
    const buttons = [...document.querySelectorAll('.fuse-toolbar button')]
    assert.equal(buttons.length, 4, '工具栏应有 4 个按钮')
    assert.equal(buttons.find((b) => b.textContent.includes('HTML')).disabled, false, '合法页面可导出')
    assert.deepEqual(buttons.map((b) => b.textContent), ['桌面', '手机', '导出 HTML', '刷新'], '工具栏只用文字，不用 emoji')
    buttons.find((b) => b.textContent === '手机').click()
    assert.equal(document.querySelector('.fuse-root-holder').style.maxWidth, '420px', '手机档应限制 420px')
    close()
  },

  '流式骨架屏': async () => {
    const { document, close } = boot(block('{"type":"dashboard","title":"半截","theme":"default","components":[{"type":"sta'))
    await wait(80)
    assert.ok(document.querySelector('.fuse-loading'), '应显示加载态')
    assert.ok(document.querySelector('.fuse-skeleton'), '应显示骨架屏')
    assert.equal(document.querySelectorAll('.fuse-error').length, 0, '流式中不得报错')
    close()
  },

  '流式结束升级错误卡': async () => {
    const { document, close } = boot(block('{"type":"dashboard", 坏掉了'))
    await wait(1400)
    assert.ok(document.querySelector('.fuse-error'), '应升级为错误卡')
    assert.ok(document.querySelector('.fuse-raw').textContent.includes('坏掉了'), '应折叠原始内容')
    close()
  },

  '非法规格错误卡': async () => {
    const bad = { type: 'dashboard', title: '坏页面', theme: 'default', components: [{ type: 'nope' }] }
    const { document, close } = boot(block(JSON.stringify(bad)))
    await wait(80)
    const err = document.querySelector('.fuse-error')
    assert.ok(err, '应显示错误卡')
    assert.match(err.textContent, /未知组件类型/)
    assert.ok(err.querySelector('details pre.fuse-raw').textContent.includes('"nope"'), '应折叠原始 JSON')
    const btn = [...document.querySelectorAll('.fuse-toolbar button')].find((b) => b.textContent.includes('HTML'))
    assert.equal(btn.disabled, true, '非法页面禁用导出')
    close()
  },

  '宿主集成': async () => {
    const host = await import('../index.mjs')
    const sections = []
    let route = null
    const ctx = {
      systemPrompt: { section: (s) => sections.push(s) },
      inject: (_deps, cb) => {
        const httpCtx = { effect: (fn) => fn(), webServer: { register: (r) => { route = r } } }
        cb(httpCtx)
      },
      logger: {},
    }
    host.apply(ctx)
    assert.equal(sections.length, 1, '应注册一段系统指令')
    assert.equal(sections[0].name, 'fuse')
    assert.ok(sections[0].text.includes('dsh-fuse 围栏'), '系统指令应讲围栏语法')
    assert.equal(route?.kind, 'prefix')
    assert.equal(route?.path, '/api/fuse')

    const res = {
      statusCode: 0,
      body: '',
      setHeader() {},
      end(body) { this.body = body },
    }
    await route.handler({ method: 'GET', url: '/api/fuse/config' }, res)
    assert.equal(res.statusCode, 200)
    const data = JSON.parse(res.body)
    assert.ok(data.themes?.default?.colors?.primary, '应返回令牌')
    assert.deepEqual(data.pageKinds, FUSE_PAGE_KINDS)
    assert.equal(data.limits.maxNodes, FUSE_MAX_NODES)

    const res404 = { statusCode: 0, body: '', setHeader() {}, end(b) { this.body = b } }
    await route.handler({ method: 'GET', url: '/api/fuse/nope' }, res404)
    assert.equal(res404.statusCode, 404)
  },

  '令牌对比度': () => {
    const luminance = (hex) => {
      const c = hex.replace('#', '')
      const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
      const f = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const ratio = (a, b) => {
      const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
      return (x + 0.05) / (y + 0.05)
    }
    for (const [name, theme] of Object.entries(themeConfig.themes)) {
      const c = theme.colors
      assert.ok(ratio(c.neutralText, c.neutralBg) >= 4.5, `${name} 正文对比度不足 4.5`)
    }
  },

  // ↓ 以下 5 项为 v2.0.6 新增的回归防线 -------------------------------------

  '子节点字段等价': async () => {
    // 回归防线：v2.0.5 修这个问题的方式是在每个 case 里手抄三元，抄漏了
    // nav / tabs / list / timeline，而当时的测试只覆盖被改过的那几个 case，所以一直绿。
    // 现在遍历全部接受子节点的类型，两种写法必须产出等价 DOM。
    const TXT = [{ type: 'text', content: 'A' }, { type: 'text', content: 'B' }]
    const cases = [
      { type: 'card', child: TXT }, { type: 'row', child: TXT }, { type: 'col', child: TXT },
      { type: 'grid', child: TXT }, { type: 'section', child: TXT }, { type: 'form', child: TXT },
      { type: 'page', child: TXT },
      { type: 'nav', child: [{ text: 'A' }, { text: 'B' }] },
      { type: 'list', child: [{ title: 'A' }, { title: 'B' }] },
      { type: 'timeline', child: [{ title: 'A' }, { title: 'B' }] },
      { type: 'tabs', child: [{ label: 'L', components: TXT }] },
    ]
    for (const c of cases) {
      const mk = (key) => block(JSON.stringify({
        type: 'dashboard', title: 'T', theme: 'default',
        components: [{ type: c.type, [key]: c.child }],
      }))
      // 两个块放进同一份文档，共享一次 JSDOM 启动
      const { document, close } = boot(mk('items') + mk('components'))
      await wait(90)
      assert.equal(document.querySelectorAll('.fuse-error').length, 0, `${c.type} 两种写法都不应报错`)
      const bodies = document.querySelectorAll('.fuse-body')
      assert.equal(bodies.length, 2, `${c.type}: 应渲染出两张卡片`)
      const a = shape(bodies[0])
      const b = shape(bodies[1])
      assert.ok(a.length > 0, `${c.type}: items 写法渲染出了空壳`)
      assert.equal(b, a, `${c.type}: components 与 items 的渲染结果必须完全一致`)
      close()
    }
  },

  '围栏识别边界': async () => {
    const json = JSON.stringify({ type: 'dashboard', title: 'T', theme: 'default', components: [{ type: 'text', content: 'A' }] })
    // 标了别的语言 → 必须不渲染。v2.0.5 的逻辑是「标注命中才 true，否则掉下去嗅探内容」，
    // 于是 lang="json" 的配置示例、模型讲解用法贴的样例 JSON 全被误渲染成卡片。
    for (const lang of ['json', 'javascript', 'yaml']) {
      const { document, close } = boot(block(json, lang))
      await wait(90)
      assert.equal(document.querySelectorAll('.fuse-card').length, 0, `lang=${lang} 的代码块不应被渲染`)
      close()
    }
    {
      const { document, close } = boot(block(json, 'dsh-fuse'))
      await wait(90)
      assert.equal(document.querySelectorAll('.fuse-card').length, 1, 'dsh-fuse 围栏应渲染')
      close()
    }
    {
      const { document, close } = boot(`<pre>${json}</pre>`)
      await wait(90)
      assert.equal(document.querySelectorAll('.fuse-card').length, 1, '无任何语言标注时才允许内容嗅探')
      close()
    }
  },

  'theme 可选性': async () => {
    const base = { type: 'dashboard', title: 'T', components: [{ type: 'text', content: 'A' }] }
    {
      // README 一直写 theme「否/缺省 default」，而校验器此前因缺 theme 整页拒绝
      const { document, close } = boot(block(JSON.stringify(base)))
      await wait(90)
      assert.equal(document.querySelectorAll('.fuse-error').length, 0, '省略 theme 应正常渲染，不再整页拒绝')
      assert.ok(document.querySelector('.fuse-toolbar-label')?.textContent?.includes('default'), '缺省应回落到 default')
      close()
    }
    {
      // 写了不认识的主题名 → 回落到 default 而不是整页报错：
      // 呈现层字段不该让页面变成一张错误卡（顺带消掉了「是否报错取决于令牌加载时序」的不一致）
      const { document, close } = boot(block(JSON.stringify({ ...base, theme: 'nope' })))
      await wait(90)
      assert.equal(document.querySelectorAll('.fuse-error').length, 0, '未知主题名应回落，不报错')
      assert.ok(document.querySelector('.fuse-toolbar-label')?.textContent?.includes('default'), '未知主题名应回落到 default')
      close()
    }
  },

  '刷新重新拉取令牌': async () => {
    const spec = { type: 'dashboard', title: 'T', theme: 'default', components: [{ type: 'text', content: 'A' }] }
    const { document, close, fetchCount } = boot(block(JSON.stringify(spec)))
    await wait(90)
    const before = fetchCount()
    assert.ok(before >= 1, '初次应拉取令牌')
    toolbarBtn(document, '刷新').click()
    await wait(120)
    assert.ok(fetchCount() > before, `刷新必须真的重新请求令牌（${before} → ${fetchCount()}）`)
    close()
  },

  '导出保真': async () => {
    // 注意：根节点的 type:'form' 是「页面类型」而非表单组件，必须再包一个 form 组件才有 <form> 元素
    const spec = {
      type: 'dashboard', title: '报名表', theme: 'default',
      components: [
        { type: 'form', items: [
          { type: 'input', label: '姓名' },
          { type: 'checkbox', label: '同意条款' },
        ] },
      ],
    }
    const { document, close, exportedHtml } = boot(block(JSON.stringify(spec)))
    await wait(90)
    document.querySelector('.fuse-input').value = '张三'
    document.querySelector('.fuse-check input').checked = true
    toolbarBtn(document, '导出 HTML').click()
    await wait(60)
    const html = exportedHtml() ?? ''
    assert.ok(html.length > 0, '应产出导出内容')
    assert.ok(/value="张三"/.test(html), '导出应带上用户填写的输入值（value 是 property，不会自动进 innerHTML）')
    assert.ok(/checked="checked"/.test(html), '导出应带上勾选状态')
    assert.ok(/onsubmit="return false"/.test(html), '导出页无运行时 JS，表单必须自带提交拦截，否则回车会刷新丢数据')
    assert.equal(/data-fuse-key/.test(html), false, '导出产物不应残留内部随机 key')
    close()
  },

  '无障碍语义': async () => {
    const spec = {
      type: 'dashboard', title: 'T', theme: 'default', components: [
        { type: 'tabs', items: [
          { label: '第一页', content: [{ type: 'text', content: 'AAA' }] },
          { label: '第二页', content: [{ type: 'text', content: 'BBB' }] },
        ] },
        { type: 'progress', label: '完成度', value: 68, max: 100 },
        { type: 'input', label: '姓名' },
        { type: 'chart', kind: 'bars', data: [{ label: '一', value: 12 }] },
        { type: 'alert', tone: 'error', title: '出错了' },
      ],
    }
    const { document, close } = boot(block(JSON.stringify(spec)))
    await wait(90)

    // tabs：用 button 承载（span 键盘不可达）+ ARIA 关系 + 面板需保留输入
    const tabs = [...document.querySelectorAll('.fuse-tabs [role="tab"]')]
    assert.equal(tabs.length, 2, 'tab 应带 role=tab')
    assert.equal(tabs[0].tagName, 'BUTTON', 'tab 必须是 button，否则 CSS 里的 :focus-visible 永远命中不了')
    assert.equal(tabs[0].getAttribute('aria-selected'), 'true')
    const panelId = tabs[0].getAttribute('aria-controls')
    assert.ok(document.getElementById(panelId), 'aria-controls 必须指向真实存在的面板')

    tabs[1].click()
    assert.equal(tabs[1].getAttribute('aria-selected'), 'true')
    assert.equal(tabs[0].getAttribute('aria-selected'), 'false')
    const panel = document.querySelector('[role="tabpanel"]')
    assert.ok(panel?.textContent?.includes('BBB'), '面板内容应随标签切换')

    // 面板缓存：切回去时用户在面板里填的内容不得丢失
    const box = panel.querySelector('.fuse-input')
    tabs[0].click()
    tabs[1].click()
    assert.equal(document.querySelector('[role="tabpanel"]')?.textContent?.includes('BBB'), true, '切回后面板应复用而非重建')

    // 键盘：←/→ 应能切换标签
    const bar = document.querySelector('.fuse-tabs')
    const key = bar.ownerDocument.defaultView.KeyboardEvent
    bar.dispatchEvent(new key('keydown', { key: 'ArrowLeft', bubbles: true }))
    assert.equal(tabs[0].getAttribute('aria-selected'), 'true', '左方向键应切到前一个标签')

    // progress / input / chart / alert 的语义
    const bar2 = document.querySelector('[role="progressbar"]')
    assert.equal(bar2.getAttribute('aria-valuenow'), '68')
    assert.equal(bar2.getAttribute('aria-valuemax'), '100')
    const input = document.querySelector('.fuse-input')
    const label = document.querySelector('label.fuse-label')
    assert.ok(input.id, 'input 必须有 id')
    assert.equal(label.getAttribute('for'), input.id, 'label 的 for 必须指向控件 id，否则读屏无从关联')
    assert.equal(document.querySelector('.fuse-chart')?.getAttribute('role'), 'img')
    assert.ok(document.querySelector('.fuse-chart')?.getAttribute('aria-label')?.includes('柱状图'), '图表需有文字替代表述')
    assert.equal(document.querySelector('.fuse-alert')?.getAttribute('role'), 'alert', 'error 语气应用 alert 而非 status')
    close()
  },
}

const name = process.env.FUSE_TEST_CASE ?? '词汇表同步'
const run = cases[name]
assert.ok(run, `未知用例 ${name}`)
await run()
console.log('✔', name)
process.exit(0)
