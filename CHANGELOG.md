# 变更记录

本文件记录本插件的可见变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循语义化版本

## [0.1.1] - 2026-10-23

### 新增

- `apiTokenFile` 配置与懒解析令牌：每次请求重新读取，改文件即可轮换令牌，不需要重启 dsh
- `galatea_link_health`：只检查 Link 服务与当前会话状态
- `galatea_link_readiness`：汇总模型、运行资产、卡数据库、`remote_dsh` 后端、服务器与决策模式，输出 `ready_to_start`、`warnings` 与 `errors`
- `galatea_link_test_server`：对当前或指定 YGOPro 服务器做 TCP 连通性检查，不修改任何配置
- `tests/host-021.test.js`：用已安装的 `@deepseek-ai/dsh-*` `0.2.1-rc.2` 发布包实跑 `startActivation` 分支
- `CONTRIBUTING.md`、`CHANGELOG.md` 与 issue 模板

### 变更

- 对局自然结束（`duel.result`、`service.session.ended/stopped/failed`）后自动释放会话绑定，其他 dsh 会话可以直接配置开局
- 心跳上报的 `plugin_version` 改为从 `package.json` 读取
- 工具输出契约由空 schema 收紧为对象 schema，宿主可校验，PTC 模式也能推导类型
- 捆绑技能的注册改为等待式注入，`skills` 服务晚于插件挂载时也不会丢技能
- `subagents` 接口缺失时在加载阶段直接报错，不再静默失效
- README 重写安装入口，补常见问题与反馈渠道

### 修复

- Link 返回 5xx 且正文为空时不再抛出 JSON 解析异常，改为可读的状态码错误
- `galatea_link_test_server` 连接失败时返回可诊断结果与判断提示，不再当作工具故障
- 去掉未使用的 `agents` 注入
- `engines.node` 下限由 `>=22.19.0` 放宽到实测可用的 `>=22.18.0`，避免在 22.18 宿主上安装时出现无意义的 `EBADENGINE` 警告

### 验证

- `npm test`：22 项，21 通过、1 跳过（需要 Link 仓库的 Python fixture）
- 真实宿主：dsh 源码 `0.1.7-rc.1`（`subagents.start`）与官方发布包 `0.2.1-rc.2`（`subagents.startActivation`）均实跑通过
- 真实 Link `3.2.0`：健康检查、开局条件汇总、服务器连通性测试、卡组查询与临时会话配置均实测

## [0.1.0]

首个可用版本

- 11 个对局工具：状态、卡组列表、YDK 导入、会话配置、开始与停止、观察、游戏聊天、介入策略、临时卡组编辑、手动提交决策
- 通过 Link HTTP 与 WebSocket 接口工作，后台决策使用 dsh 自身执行器继承会话人格与已完成上下文
- 限时取消、旧决策拒绝、聊天按序号去重、赛后摘要注入所属会话
- 临时卡组按 dsh 会话作用域隔离
- 捆绑安装检查技能 `galatea-link-setup`
