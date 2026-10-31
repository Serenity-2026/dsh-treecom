# TreeCom — 对话树

> Tree-shaped conversation branching for DeepSeek Harness. Keep one visible conversation; manage its branches as a tree.
>
> 版本 **0.1.0** · MIT · DeepSeek Harness Web 插件

用一个对话窗口和一棵树管理它的分支；分支仍然是普通会话，会出现在左侧工作区：

- 每个节点是一轮对话；
- **点节点 = 跳转到该分支并定位到那一轮**，不会创建新分支；高亮只到该节点（祖先 + 自身），后代不高亮；
- **点节点上的「分叉」按钮 = 在该轮结束处创建子分支**，并切到新的子分支继续；
- 有子节点的分支可点节点最左侧的独立竖条收起/展开，悬停该竖条会变深；
- 选中节点用主题的 DeepSeek 强调色（`state-business-primary`）做浅色背景/边框/标题，浅色模式下边框清晰，深浅色模式都适配；「你在这里」用主题绿色；
- 分支叶子节点显示会话标题：在对话区改名会同步到叶子，在树上改名也会同步回会话标题；中间轮次节点保留自己的标签；
- 浮层树面板可拖动左边缘调整宽度；
- 分支标签默认取该轮首问，双击可改名；
- **两个入口**：
  - 标题栏右上角的「对话树」按钮：打开从右侧滑入的浮层；再点该按钮或点击对话区会以滑出动画收回；
  - 会话视图里的「树」标签页：和「对话 / 轨迹 / 上下文」并排，适合全屏看树；
  - 从左侧切换会话时浮层保持打开并加载新会话的树；右侧栏 tab、输入框上方的路径条都没有；
- 每次对话结束后的分叉统一使用宿主自带的「在新对话中分支」，插件不再额外加「分叉」按钮；树节点上的「分叉」用于从任意旧节点开分支；
- 新分支不再自动归档，会直接出现在左侧工作区；每个节点有「归档」按钮；
- **归档同步**：已归档的分支不在树里显示；在左侧取消归档后，它会自动回到树里。

## 为什么底层是 fork

DSH 的会话日志是 append-only 的线性 surface，聊天区只渲染「追加」消息。
在一个物理会话里用 `surfaceOp: replace` 切分支，只会改变模型看到的内容，
不会改变聊天记录；要做到「界面也跟着切」，只能重写整套 Chat 渲染层。

DSH 官方支持的分支原语是 fork：把某一轮之前的完整事件前缀复制成子会话。
子会话的聊天区显示的就是「到该轮为止的同一段对话」，因此切分支看起来是
「回到那一轮」，不是打开一个新对话。TreeCom 把这个过程藏在一个树面板后面。

## 环境要求

- DeepSeek Harness（Web UI），已启用本地插件/bundle。
- 插件是纯 JavaScript，无构建步骤；Host 半与 Client 半都在仓库里。

## 安装

`dsh plugin` 会把参数转发给 profile 目录里的 pnpm，因此 npm 包名、`github:`、`link:`、`file:` 等 pnpm 支持的 spec 都可以。

从 GitHub 直接安装（当前可用）：

```bash
dsh plugin --profile web add github:Serenity-2026/dsh-treecom
```

发布到 npm 后，也可以只写包名：

```bash
dsh plugin --profile web add dsh-treecom
```

本地开发时，克隆后把目录 link 进 profile：

```bash
git clone https://github.com/Serenity-2026/dsh-treecom.git
dsh plugin --profile web add link:"$PWD/dsh-treecom"
```

安装或更新后刷新 DSH Web 页面（Host 半的 `/treecom` 路由需要重新加载）。

> 仓库名是 `dsh-treecom`，当前 npm 包名是 `treecom`；npm 上计划使用 `dsh-treecom`。在 npm 发布前，请使用上面的 `github:` spec。

## 使用

1. 点标题栏右上角的「对话树」，或会话视图里的「树」标签页；
2. 点任意节点回到那一轮继续对话；
3. 在需要开分支的节点上点「分叉」，新分支会作为普通会话出现在左侧；
4. 节点最左侧的竖条收起/展开子分支；
5. 双击节点标签或会话标题改名，两侧同步；
6. 节点上的「归档」把分支移出树；在左侧取消归档即可恢复。

## 结构与数据

- `index.js`：Host 半。只读索引 `/treecom`，读 `sessionQuery` 的会话日志，
  把轮次按 `inheritedEventCount` 归一化，共享主干只画一次；标签写到
  `~/.dsh/storages/treecom/state.json`。不写任何会话日志。
- `plugin.client.js`：Client 半。浮层树面板、标题栏入口、会话视图「树」标签页；
  fork/切换走正常 Client 服务。
- `locale/`：中英文案；`icon.svg`：插件图标；`cordis.patch.yml`：bundle 挂载行。

所有数据都在本地：树索引读本地会话日志，标签写本地 sidecar 文件，不发起任何网络请求。

## 已知边界

- 底层每个分支是一条 fork 会话，会正常出现在左侧工作区（标题带 (1)、(2) 后缀）。
- 点节点的「分叉」才会创建分支；如果随后不提问，会留下一个空分支，
  在树里显示为「新分支 · 等待提问」；它也会出现在侧栏，可在节点上归档，或在左侧取消归档恢复。
- 当前分支正在生成时，分叉按钮、树上的分叉动作和归档按钮会禁用；
- 刷新按钮会转圈，完成后弹出「刷新成功」提示；
- 卸载插件后所有会话仍在；归档的分支可在 DSH 的归档列表里取消归档。

## License

MIT © 2026 Minchuan Deng
