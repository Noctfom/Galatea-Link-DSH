# 参与 Galatea Link DSH

这个插件是从“让 dsh 真正坐在牌桌上”这个想法长出来的，很多决定都来自实测和别人的反馈。欢迎任何形式的参与，包括被认为“很小”的事情

## 联系方式

- 交流群（QQ）：**492420925**
- 作者邮箱：**noctfom114514@outlook.com**
- 问题与建议：[GitHub Issues](https://github.com/Noctfom/Galatea-Link-DSH/issues)
- 代码与文档改进：[Pull Request](https://github.com/Noctfom/Galatea-Link-DSH/pulls)

群和邮箱都适合先聊想法再动手。不确定算不算 bug、不确定该怎么实现、或者只是想说说你在什么场景下用它，都可以直接说

## 特别希望得到的反馈

下面这些比单纯报“不能用了”更有价值，也更容易变成实际改进

- **真实对局记录**：哪一步开始偏离、当时 Link 的时点预算、模型是否慢于预算、比赛最后是否正常结束
- **模型与人格表现**：不同模型在“只返回合法 choice_id 的限时任务”里的差异，哪些提示词约束是多余的
- **卡组工作流**：你希望 dsh 在赛前怎么帮你准备 YDK、怎么发限制卡表变化
- **别家的接入方式**：如果你在 AstrBot、其他 harness 或自建客户端里接过 Link，哪些设计值得这里借鉴
- **文档踩坑**：第一次安装时你在哪一步卡住、哪句话看不懂，这直接决定别人能不能用起来

## 提交 Issue 时

请说明插件版本、dsh 版本、Link 版本（`galatea_link_health` 与 `galatea_link_readiness` 的输出最有用），以及复现步骤

**不要贴** Link 令牌、模型 API Key、完整环境变量、别人的卡组或对局内容。日志里如果出现这些请先打码

## 提交 PR 时

1. 先开 issue 对齐方向，避免做完了才发现不想要
2. 读完 [AGENTS.md](AGENTS.md) 的约定，尤其是只通过 Link HTTP 与 WebSocket 接口工作、不碰 Python/Torch/ONNX、不改 Link 内核
3. 保持现有不变量：会话归属、期限取消、旧决策拒绝、卡组隔离、事件处理不等待模型生成
4. 新代码文件头部与新函数前补简短中文功能注释，中文注释不带句号
5. 跑测试并通过

```bash
npm test
# 有本地 dsh 源码时
$env:DSH_SOURCE_ROOT="F:/DeepseekHarness/deepseek-harness"; npm test
# 有安装好的 0.2.1 发布包时
$env:DSH_PACKAGE_ROOT="<安装目录>"; npm test
```

6. 涉及宿主 API 的兼容改动尽量只改 `src/harness.js`，并对新旧两个入口都保留分支
7. 一次 PR 只做一件事，说明“为什么”比“改了什么”更重要

## 如果想反哺更多

这个项目依赖两件事：真实对局数据，和愿意在别人踩坑前先把坑填上的人。如果你做出了新工具、新决策策略、新卡组流程，或者只是把安装文档写得更清楚，都欢迎提回来。也可以直接进群聊，把想法放出来让别人接着做

## 维护者发布流程

发布前确认改的是 `package.json` 的 `version`，并把变动写进 [CHANGELOG.md](CHANGELOG.md)。插件没有构建步骤，`files` 里的内容就是发布物

```bash
npm test                                   # 至少跑单测
npm pack --dry-run                         # 核对将要发布的内容
npm login                                  # 需要已注册的 npm 账号
npm publish                                # publishConfig 已固定 registry 与 access: public
npm view dsh-plugin-galatea-link version   # 确认远端版本
npm pack                                   # 需要 tarball 时用它，产物可直接 dsh plugin add
```

发布后打 tag，方便用户锁定 commit：

```bash
git tag v0.1.1 && git push origin v0.1.1
```

### 如果 npm 暂时不可用

npm 站点或发布通道受限时不必卡住，以下两种方式都能让用户装上，且不需要构建授权：

- **GitHub 直装**：`dsh plugin --profile web add github:Noctfom/Galatea-Link-DSH#<commit-sha>`
- **自带 tarball**：`npm pack` 生成 `dsh-plugin-galatea-link-<version>.tgz`，附加到 GitHub Release，用户执行 `dsh plugin --profile web add ./dsh-plugin-galatea-link-<version>.tgz`

注意 tarball 与 GitHub 直装都按 `package.json` 的版本号区分，务必先改版本再打包，并在 README 与 CHANGELOG 里同步
