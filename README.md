# Galatea Link for DeepSeek Harness

让 dsh 主智能体通过原生工具参加 YGOPro 对局，并与对手在游戏内聊天。Link 负责游戏协议、Core 模型和时限回退；插件复用 dsh 当前模型、人格与已完成对话上下文，不再给 Link 配一套 LLM

- 插件版本 `0.1.1`，适配 dsh `0.1.7-rc.1`（`subagents.start`）与官方 `0.2.1-rc.2`（`subagents.startActivation`）
- 需要 Link `3.2.0` 及以上，且声明的决策后端包含 `remote_dsh`
- 纯 JavaScript，无构建步骤，`dsh plugin add` 不会触发构建授权

## 一、最快路径：把下面这段发给 dsh

> 请把 Galatea Link dsh 插件安装到我正在使用的 profile：
> 仓库 `https://github.com/Noctfom/Galatea-Link-DSH`，本机路径 `E:/Galatea_Link_DSH`。
> 先确认 Link 服务在 `http://127.0.0.1:8765` 可用，再执行
> `dsh plugin --profile <我的profile> add <仓库地址或本机绝对路径>`，
> 装好后调用 `galatea_link_readiness` 检查模型、运行资产和 `remote_dsh` 支持，
> 调用 `galatea_link_list_decks` 列出卡组。保留 Link 现有决策模式，最后由我指定房间再开局。

装好并重启 profile 后，本插件会同时注册一个安装检查技能 `galatea-link-setup`，之后的会话可以直接说“用 galatea-link-setup 检查环境”

## 二、你需要自己做的两件事

这两步插件做不到，必须由你完成：

1. **让启动 dsh 的进程拿到 Link 令牌**，二选一：
   - 启动前设置环境变量 `GALATEA_LINK_URL`（默认 `http://127.0.0.1:8765`）与 `GALATEA_LINK_API_TOKEN`
   - 或者在 profile 里配置 `apiTokenFile` 指向一个令牌文件。**这条不需要重启 dsh**：插件每次请求都重新读取该文件，dsh 运行中新写入或轮换令牌立即生效

   `.env.example` 只是参考，插件不会自行读取 `.env`。Link 的令牌是控制服务的管理凭据，拿到它的其他程序仍拥有 API 访问权限

2. **让 Link 具备开局条件**：Link 启动本身不加载模型。先在 Link WebUI 导入卡组与 GKG，或上传 ONNX/PTH 模型及其 V3 运行资产，并选中模型。用 `galatea_link_readiness` 可以随时确认还缺什么

## 三、安装方式

### 从 GitHub 安装（推荐，无需构建授权）

```bash
dsh plugin --profile web add github:Noctfom/Galatea-Link-DSH#<commit-sha>
```

本插件没有 `prepare` 构建脚本，pnpm ≥10 不会向你索取 `allowBuilds` 授权。建议锁定 commit，避免后续推送悄悄改变实际运行内容

### 从 npm 或 tarball 安装

```bash
dsh plugin --profile web add dsh-plugin-galatea-link
dsh plugin --profile web add ./dsh-plugin-galatea-link-0.1.1.tgz
```

### 从本机目录安装

```bash
cd <插件目录>
npm install
```

在 dsh 源码仓库目录执行：

```powershell
pnpm dsh plugin --profile web add E:/Galatea_Link_DSH
```

使用 npm 安装版 dsh 时改为 `dsh plugin --profile web add <插件绝对路径>`，然后重启当前 dsh profile。插件行的 profile 内 ID 为 `galatea-link`，所有设置都可以在该 profile 的插件配置中修改

## 四、可用工具

| 工具 | 用途 | 需要先绑定对局 |
| --- | --- | --- |
| `galatea_link_health` | Link 是否在线与当前会话状态 | 否 |
| `galatea_link_readiness` | 是否具备开局条件：模型、运行资产、卡数据库、`remote_dsh`、服务器与决策模式 | 否 |
| `galatea_link_test_server` | 测试当前或指定的 YGOPro 服务器能否连接，只做 TCP 连通性检查 | 否 |
| `galatea_link_status` | 插件连接、会话归属、错误和当前会话赛后摘要 | 否 |
| `galatea_link_list_decks` | 公共本地卡组与当前会话临时卡组的名称、内容与来源 | 否 |
| `galatea_link_import_deck` | 导入 YDK 为本会话临时副本 | 否 |
| `galatea_link_configure_session` | 服务器、房间密码、卡组、决策模式与预算 | 否 |
| `galatea_link_start_duel` / `galatea_link_stop_duel` | 开始或结束当前会话对局 | 是 |
| `galatea_link_observation` | 当前玩家可见状态与合法动作 | 是 |
| `galatea_link_game_chat` | 手动发送游戏内短消息 | 是 |
| `galatea_link_controls` | 修改介入策略及自主调整开关 | 是 |
| `galatea_link_edit_current_deck` | 显式授权后赛前修改当前临时卡组 | 是 |
| `galatea_link_submit_decision` | 调试时手动提交当前合法动作 | 是 |

推荐顺序：`galatea_link_health` → `galatea_link_readiness` → `galatea_link_test_server` → `galatea_link_list_decks` → `galatea_link_configure_session` → `galatea_link_start_duel`

## 五、插件设置

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `baseUrl` | `http://127.0.0.1:8765` | Link 地址，`GALATEA_LINK_URL` 优先 |
| `apiTokenEnv` | `GALATEA_LINK_API_TOKEN` | Token 环境变量名 |
| `apiTokenFile` | 空 | 令牌文件路径，每次请求重新读取，改文件即可换令牌 |
| `apiToken` | 空 | Token 兼容配置，环境变量与文件优先 |
| `autoConnect` | `true` | 加载后自动连接和发送心跳 |
| `instanceName` | `DeepSeek Harness` | Link 控制台显示名称 |
| `requestTimeoutMs` | `15000` | 普通 HTTP 请求上限 |
| `heartbeatIntervalMs` | `10000` | 心跳与 pending 恢复间隔 |
| `reconnectDelayMs` | `3000` | 事件流断线重连间隔 |
| `remoteAgentEnabled` | `true` | 开启后台动作决策 |
| `gameChatEnabled` | `true` | 允许回复新的对手游戏消息 |
| `allowAgentDeckEdit` | `false` | 显式开放当前临时卡组编辑 |
| `injectDuelSummary` | `true` | 赛后注入有界摘要 |
| `subagentProvider` | `fork` | 继承当前会话上下文的 dsh 后台执行后端，`fork` 由 `@deepseek-ai/dsh-base` 自带 |
| `chatBudgetMs` | `10000` | 聊天生成上限，动作决策始终优先 |

普通 HTTP 超时不控制动作预算，动作实际等待时间来自 Link 的 `decision.llm_time_budget`。自主调整仍由 Link 开关、revision、TTL 和上下界校验

## 六、异步与隐私

每个决策使用 dsh 自身的独立限时任务，继承发起会话已完成的上下文与模型。后台任务只保留结构化结果工具，防止对手文本触发文件和安装操作；原会话可继续与用户交流。任务关闭、网络断线、新时点或停止时都会取消旧任务，提交前再检查 `session_id`、`request_id` 和 `observation_id`

不向原会话逐动作注入牌局正文。结束时注入一次结构化摘要，包含胜负或断线原因、动作数与聊天数，后续普通对话即可记得结果。对手聊天按 `sequence` 去重，历史聊天不重复触发

同一 Link 进程只支持一局游戏。插件把对局绑定到发起它的 dsh 会话，其他会话不能停止、编辑或读取它的观察；**对局自然结束后绑定自动释放**，其他会话可以直接配置开局，原会话仍能看到自己那局的赛后摘要

Link 本地卡组是公共目录，选中后复制为当前会话临时副本；dsh 与 AstrBot 的作用域通过前缀区分。当前沿用 Link API v1 的临时卡组内部引用格式与存储目录，外部来源标签会明确标记 dsh

## 七、兼容与验证

针对本地源码 `0.1.7-rc.1` 的 `subagents.start` 与官方 `0.2.1-rc.2` 的 `subagents.startActivation` 分别适配，新版本只用 `agent/created` 加 `tools.restrict`/`tools.guard` 限制子任务工具。dsh 仍处于快速变化阶段，后续不兼容 API 应只修改 `src/harness.js`

宿主缺少受支持的 `subagents` 接口时，插件加载阶段会直接报错，不会静默失效

```bash
npm test
```

真实宿主加载测试可设置 `DSH_SOURCE_ROOT=F:/DeepseekHarness/deepseek-harness` 后运行测试。该测试只读取宿主构建产物，不更改 profile 或调用收费模型

## 八、已知边界

- 当前未复刻 AstrBot 工具箱的在线查裁定、QQ 文件解析和 BO3 换备，dsh 可继续使用自身查卡、网络与文件工具准备 YDK
- 模型、GKG 与调用密钥在 Link WebUI 管理，插件只做只读诊断
- 插件不能安装或启动 Link 本身，也不能改宿主进程的环境变量，首次连接的令牌注入与模型准备需要用户参与
- `galatea_link_test_server` 的失败原因来自 Link：连接失败会被 Link 统一映射为 5xx，因此插件只能给出“不可达或端口未开放”的判断提示

协议依据：[官方插件打包文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)、[官方工具定义文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-tool.md)
