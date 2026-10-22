// Galatea Link 的 dsh 原生插件入口，挂载工具与异步游戏桥接
import { Config } from './config.js';
import { GalateaDshBridge, PLUGIN_VERSION } from './bridge.js';
import { HarnessRunner } from './harness.js';
import { registerTools } from './tools.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export { Config, GalateaDshBridge, HarnessRunner, PLUGIN_VERSION };
export const name = 'galatea-link';
export const inject = ['tools', 'subagents'];

// 检查宿主是否提供本插件支持的子任务执行接口
function assertHostCompatibility(ctx) {
  const subagents = ctx.subagents;
  if (typeof subagents?.startActivation !== 'function' && typeof subagents?.start !== 'function') {
    throw new Error('当前 dsh 缺少受支持的 subagents 执行接口，请升级 dsh 或回退到已适配版本');
  }
}

// 在 Cordis 作用域中安装工具并随插件卸载回收连接
export function apply(ctx, options) {
  const config = Config(options || {});
  assertHostCompatibility(ctx);
  const runner = new HarnessRunner(ctx, config.subagentProvider);
  const bridge = new GalateaDshBridge(config, runner);
  registerTools(ctx, bridge);
  ctx.effect(() => {
    if (config.autoConnect) bridge.open();
    return () => bridge.close();
  });
  ctx.on('agent/disposed', ({ agent }) => {
    if (bridge.owner?.id === agent.id) bridge.releaseBinding();
  });
  // 等待技能服务出现后注册捆绑技能，避免服务晚挂载导致技能永久缺失
  ctx.inject(['skills'], skillCtx => {
    skillCtx.skills.register({ name: 'galatea-link-setup', source: 'bundled',
      description: '安装检查与配置 Galatea Link 游戏服务，接入 dsh 主智能体',
      content: readFileSync(new URL('../skills/galatea-link-setup/SKILL.md', import.meta.url), 'utf8'),
      resourceBase: { kind: 'directory', path: fileURLToPath(new URL('../', import.meta.url)) },
    });
  });
}
