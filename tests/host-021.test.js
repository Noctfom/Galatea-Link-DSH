// dsh 0.2.1 起点的兼容测试，从已安装的官方发布包验证 startActivation 分支
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import * as plugin from '../src/index.js';

const root = process.env.DSH_PACKAGE_ROOT;

test('在已安装的 dsh 0.2.1 发布包上走通 startActivation 分支', { skip: !root, timeout: 60000 }, async () => {
  // 以目标安装目录为基准解析宿主包，避免被本插件自身依赖影响
  const require = createRequire(path.join(root, 'package.json'));
  const load = spec => import(pathToFileURL(require.resolve(spec)).href);
  const { Context } = await load('@deepseek-ai/cordis');
  const { LlmAdapter, createUserMessage } = await load('@deepseek-ai/dsh-llm');
  const { mountAgentLoopTestDependencies } = await load('@deepseek-ai/dsh-agent-loop-testkit');
  const agentLoopModule = await load('@deepseek-ai/dsh-agent-loop');
  const subagentsModule = await load('@deepseek-ai/dsh-subagent');
  const forkModule = await load('@deepseek-ai/dsh-subagent-fork-in-process');
  const skillModule = await load('@deepseek-ai/dsh-skill');
  const AgentLoop = agentLoopModule.default ?? agentLoopModule.AgentLoop;
  const Subagents = subagentsModule.default ?? subagentsModule.SubagentRuntime;
  const fork = forkModule.default ?? forkModule;
  const Skill = skillModule.default ?? skillModule.SkillRegistry;

  const requests = [];
  // 为测试模型返回固定路由与可驱动子任务的结构化输出
  class DeterministicAdapter extends LlmAdapter {
    async resolveModel(provider, model) { return { provider, id: model, name: model }; }
    async *stream(options) {
      requests.push(options);
      if (options.tools?.some(tool => tool.name === 'structured_output')) {
        const schema = options.tools.find(tool => tool.name === 'structured_output').parameters;
        const args = JSON.stringify(Object.hasOwn(schema.properties ?? {}, 'reason')
          ? { choice_id: 2, reason: '发布包验证' } : { choice_id: 2 });
        yield { type: 'block-start', index: 0, blockType: 'tool-call' };
        yield { type: 'tool-call-delta', index: 0, id: 'choice', name: 'structured_output', argumentsDelta: args };
        yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'choice', name: 'structured_output', arguments: args } };
        yield { type: 'finish', reason: { kind: 'tool-calls' } };
      } else {
        yield { type: 'block-start', index: 0, blockType: 'text' };
        yield { type: 'text-delta', index: 0, text: '已经记住偏好' };
        yield { type: 'block-end', index: 0, block: { type: 'text', text: '已经记住偏好' } };
        yield { type: 'finish', reason: { kind: 'stop' } };
      }
    }
  }

  const ctx = new Context();
  try {
    await mountAgentLoopTestDependencies(ctx);
    const cwd = process.cwd();
    // 0.2.1 的本地子任务需要 workingDirectory.set，测试装置补齐该服务
    ctx.provide('workingDirectory', {
      defaultDirectory: cwd,
      get: session => session.header.cwd ?? cwd,
      ensure: agent => Promise.resolve(agent.session.header.cwd ?? cwd),
      set: async () => {},
    });
    await ctx.plugin(AgentLoop, { agents: [] });
    await ctx.plugin(Subagents);
    await ctx.plugin(fork, { providerName: 'fork' });
    await ctx.plugin(Skill);
    await ctx.plugin(plugin, { autoConnect: false });

    assert.equal(typeof ctx.subagents.startActivation, 'function', '应使用 startActivation 分支');
    assert.equal(ctx.tools.schemas().length, 14, '插件应注册 14 个工具');
    const skills = await ctx.skills.list();
    assert.ok(skills.some(item => item.name === 'galatea-link-setup'), '捆绑技能应已注册');

    ctx.llm.registerAdapter(['fixture'], new DeterministicAdapter());
    ctx.systemPrompt.section({ name: 'deployment:galatea-021', order: 10, text: '保持温柔的游戏人格' });
    const owner = await ctx.agentLoop.create('galatea-021-test', { provider: 'fixture', model: 'fixture' });
    owner.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '记住测试偏好：白龙卡组' }] }));
    await owner.whenIdle();

    const runner = new plugin.HarnessRunner(ctx, 'fork');
    const result = await runner.run(owner, '选择合法动作', {
      type: 'object', additionalProperties: false,
      properties: { choice_id: { type: 'integer' }, reason: { type: 'string' } },
      required: ['choice_id', 'reason'],
    }, AbortSignal.timeout(20000));
    assert.equal(result.choice_id, 2);

    const child = requests.find(item => item.tools?.some(tool => tool.name === 'structured_output'));
    const childTools = child.tools.map(tool => tool.name);
    assert.deepEqual(childTools, ['structured_output'], `子任务只应看到结构化输出工具，实际 ${childTools.join(',')}`);
    assert.ok(JSON.stringify(child.messages).includes('白龙卡组'), '子任务应继承父会话上下文');

    runner.injectSummary(owner, { outcome: 'win' });
    assert.ok(JSON.stringify(owner.session.snapshotEvents()).includes('win'), '摘要应注入原会话');
  } finally { await ctx.fiber.dispose(); }
});
