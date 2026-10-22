// dsh 执行兼容测试，覆盖旧入口、现代入口与取消后释放
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HarnessRunner } from '../src/harness.js';

// 创建只保留本测试所需接口的宿主上下文
function fakeContext(subagents) {
  return { subagents, on() {}, tools: {} };
}
const owner = { id: 'owner', ctx: { tools: { schemas() { return [{ name: 'bash' }]; } } } };

test('兼容本地 0.1.7 的 start 并继承当前会话', async () => {
  let disposed = 0;
  const runner = new HarnessRunner(fakeContext({
    async start(provider, request) {
      assert.equal(provider, 'fork'); assert.equal(request.parent, owner);
      assert.deepEqual(request.toolFilter.deny, ['bash']);
      return { result: Promise.resolve({ stopReason: 'completed', structured: { choice_id: 0 } }), async dispose() { disposed++; } };
    },
  }), 'fork');
  const result = await runner.run(owner, '观察', { type: 'object' }, new AbortController().signal);
  assert.equal(result.choice_id, 0); assert.equal(disposed, 1);
});

test('现代入口使用 caller 交付而不把每步结果灌入原对话', async () => {
  const runner = new HarnessRunner(fakeContext({
    async startActivation(spec) {
      assert.equal(spec.delivery, 'caller'); assert.equal(spec.request.parent, owner);
      assert.ok(spec.childId.startsWith('galatea-'));
      return { result: Promise.resolve({ stopReason: 'completed', structured: { choice_id: 2 } }), async dispose() {} };
    },
  }), 'fork');
  assert.equal((await runner.run(owner, '观察', {}, new AbortController().signal)).choice_id, 2);
});

test('旧任务没有模型返回时取消也能快速结束并释放资源', async () => {
  let disposed = false;
  const runner = new HarnessRunner(fakeContext({ async start() {
    return { result: new Promise(() => {}), async dispose() { disposed = true; } };
  } }), 'fork');
  const controller = new AbortController();
  const task = runner.run(owner, '观察', {}, controller.signal);
  await Promise.resolve(); controller.abort();
  await assert.rejects(task);
  assert.ok(disposed);
});
