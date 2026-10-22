// 真实 dsh 后台执行测试，使用确定性模型验证上下文继承与结构化结果
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { HarnessRunner } from '../src/harness.js';

const root = process.env.DSH_SOURCE_ROOT;

test('本地真实 AgentLoop 与 fork 后端能够继承人格上下文并返回游戏选择', { skip: !root, timeout: 10000 }, async () => {
  // 读取本地源码构建产物而不更改宿主依赖或配置
  const load = relative => import(pathToFileURL(path.join(root, relative)).href);
  const { Context } = await load('vendor/cordis/lib/index.js');
  const { LlmAdapter, createUserMessage } = await load('packages/llm/llm/lib/index.js');
  const { mountAgentLoopTestDependencies } = await load('packages/test-support/agent-loop-testkit/lib/index.js');
  const { default: AgentLoop } = await load('packages/core/agent-loop/lib/index.js');
  const { default: Subagents } = await load('packages/subagent/subagent/lib/index.js');
  const fork = await load('packages/subagent/subagent-fork-in-process/lib/index.js');
  const requests = [];

  class DeterministicAdapter extends LlmAdapter {
    // 为测试模型返回确定的路由元数据
    async resolveModel(provider, model) { return { provider, id: model, name: model }; }

    // 生成真实 dsh 流协议以驱动父会话和结构化子任务
    async *stream(options) {
      requests.push(options);
      if (options.tools?.some(tool => tool.name === 'structured_output')) {
        const argumentsJson = JSON.stringify({ choice_id: 2 });
        yield { type: 'block-start', index: 0, blockType: 'tool-call' };
        yield { type: 'tool-call-delta', index: 0, id: 'choice-test', name: 'structured_output', argumentsDelta: argumentsJson };
        yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'choice-test', name: 'structured_output', arguments: argumentsJson } };
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
    await ctx.plugin(AgentLoop, { agents: [] });
    await ctx.plugin(Subagents);
    await ctx.plugin(fork, { providerName: 'fork' });
    await ctx.plugin(await import('../src/index.js'), { autoConnect: false });
    ctx.llm.registerAdapter(['fixture'], new DeterministicAdapter());
    ctx.systemPrompt.section({ name: 'deployment:galatea-test', order: 10, text: '保持温柔的游戏人格' });
    const owner = await ctx.agentLoop.create('galatea-parent-test', { provider: 'fixture', model: 'fixture' });
    owner.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '记住测试偏好：白龙卡组' }] }));
    await owner.whenIdle();
    const runner = new HarnessRunner(ctx, 'fork');
    const result = await runner.run(owner, '选择合法动作', {
      type: 'object', additionalProperties: false, properties: { choice_id: { type: 'integer' } }, required: ['choice_id'],
    }, AbortSignal.timeout(5000));
    assert.equal(result.choice_id, 2);
    const request = requests.find(item => item.tools?.some(tool => tool.name === 'structured_output'));
    assert.ok(JSON.stringify(request.messages).includes('白龙卡组'));
    runner.injectSummary(owner, { outcome: 'win' });
    assert.ok(JSON.stringify(owner.session.snapshotEvents()).includes('win'));
  } finally { await ctx.fiber.dispose(); }
});
