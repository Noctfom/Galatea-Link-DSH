# Galatea Link dsh 插件开发说明

- 插件只通过 Link HTTP 与 WebSocket 接口工作，不能依赖 Python、Torch、ONNX 或 Link 内部模块
- dsh 与 Galatea Core 源码只能作为只读参考，兼容变更集中于 `src/harness.js`
- 新代码文件头部与新函数前添加简短中文功能注释，中文注释不带句号
- 安装、模型选择、服务器配置操作流程见 `skills/galatea-link-setup/SKILL.md`
- 维护会话归属、期限取消、旧决策拒绝和卡组隔离，不能让事件处理等待模型生成
- 对局自然结束后必须释放会话绑定，其余会话状态（赛后摘要、错误）不能跨会话暴露
- 令牌只能通过环境变量、`apiTokenFile` 或配置传入，读取必须是懒解析，不要在构造期缓存或在日志与错误里回显
- 诊断类工具（`health`、`readiness`、`test_server`）不需要会话绑定，连接失败属于可诊断结果而不是工具故障
- 心跳上报的 `plugin_version` 必须来自 `package.json`，不要硬编码
- 运行 `npm test`；`DSH_SOURCE_ROOT` 指向真实 dsh 源码构建产物，`DSH_PACKAGE_ROOT` 指向已安装的 `0.2.1` 发布包，两者都用于验证宿主兼容性
- 不提交 `.env`、Token、API Key、模型或用户卡组
