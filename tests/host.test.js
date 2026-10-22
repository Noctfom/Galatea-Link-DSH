// 真实 dsh 兼容测试，只读取构建产物并在独立内存上下文注册插件
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { apply } from '../src/index.js';

const root = process.env.DSH_SOURCE_ROOT;

test('在本地 dsh 的真实 Cordis、ToolRuntime 与 SystemPrompt 中加载工具', { skip: !root }, async () => {
  // 从只读源码部署的构建路径导入真实模块
  const load = relative => import(pathToFileURL(path.join(root, relative)).href);
  const { Context } = await load('vendor/cordis/lib/index.js');
  const { default: Tools } = await load('packages/core/tools/lib/index.js');
  const { default: SystemPrompt } = await load('packages/core/system-prompt/lib/index.js');
  const ctx = new Context();
  try {
    await ctx.plugin(SystemPrompt);
    await ctx.plugin(Tools);
    apply({
      tools: ctx.tools, subagents: { start() {} },
      on: () => {}, effect: fn => { fn(); }, inject: () => {}, get: () => undefined,
    }, { autoConnect: false });
    const schemas = ctx.tools.schemas();
    for (const name of ['galatea_link_start_duel', 'galatea_link_import_deck',
      'galatea_link_health', 'galatea_link_readiness', 'galatea_link_test_server']) {
      assert.ok(schemas.find(item => item.name === name), `缺少工具 ${name}`);
    }
    const result = await ctx.tools.execute({
      name: 'galatea_link_edit_current_deck', callId: 'test-deck',
      arguments: { operations: [{ operation: 'add', code: 123, section: 'main' }] },
      agent: { id: 'foreign' }, signal: new AbortController().signal,
    });
    assert.equal(result.isError, true);
    const assembly = await ctx.systemPrompt.assemble();
    assert.ok(assembly.tools.some(item => item.name === 'galatea_link_status'));
  } finally { await ctx.fiber.dispose(); }
});

test('宿主缺少受支持的子任务接口时给出明确错误', { skip: !root }, async () => {
  // 用最小桩验证兼容性检查先于任何网络连接
  assert.throws(() => apply({
    tools: { register() {} }, subagents: {},
    on: () => {}, effect: fn => { fn(); }, inject: () => {}, get: () => undefined,
  }, { autoConnect: false }), /subagents 执行接口/);
});
