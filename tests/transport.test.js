// 真实传输测试，验证插件经 HTTP 与 WebSocket 完成 Link 决策及聊天闭环
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { Config } from '../src/config.js';
import { GalateaDshBridge } from '../src/bridge.js';

const python = process.env.GALATEA_TEST_PYTHON;
const linkRoot = process.env.GALATEA_TEST_LINK_ROOT;

// 在有界时间内等待测试状态变化
async function waitFor(predicate) {
  const deadline = Date.now() + 8000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('端到端测试状态等待超时');
    await pause(10);
  }
}

test('通过真实 Link 服务完成心跳、选牌、决策、游戏聊天和赛后摘要', { skip: !python || !linkRoot, timeout: 15000 }, async () => {
  const server = spawn(python, ['-u', path.join(linkRoot, 'tests/dsh_fixture_server.py')], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  let diagnostic = '';
  server.stdout.on('data', data => { output += data; });
  server.stderr.on('data', data => { diagnostic += data; });
  let bridge;
  const savedUrl = process.env.GALATEA_LINK_URL;
  delete process.env.GALATEA_LINK_URL;
  try {
    await waitFor(() => /DSH_FIXTURE_URL=(\S+)/.test(output));
    const baseUrl = output.match(/DSH_FIXTURE_URL=(\S+)/)[1];
    const config = Config({ baseUrl, apiToken: 'fixture-token', apiTokenEnv: 'UNUSED_FIXTURE_TOKEN', heartbeatIntervalMs: 3000 });
    let decisions = 0;
    let chats = 0;
    const summaries = [];
    bridge = new GalateaDshBridge(config, {
      // 使用确定性模型输出而保留真实协议传输
      async run(_owner, _prompt, schema) {
        if (schema.properties.reply) { chats++; return { reply: '你好，一起决斗吧' }; }
        decisions++; return { choice_id: 2, reason: '合法动作' };
      },
      // 保存原会话应接收的摘要
      injectSummary(owner, summary) { summaries.push({ owner, summary }); },
    });
    const owner = { id: 'transport-test-owner' };
    const configured = await bridge.configure(owner, { agent: { deck: 'test' } });
    assert.equal(configured.decision.agent_backend, 'remote_dsh');
    assert.equal(configured.decision.mode, 'hybrid');
    await bridge.start(owner);
    await waitFor(() => summaries.length > 0);
    assert.equal(decisions, 1);
    assert.equal(chats, 1);
    assert.equal(summaries[0].summary.result.outcome, 'win');
    const status = await bridge.client.request('GET', '/api/v1/status');
    assert.ok(status.integrations.dsh.connected);
    assert.ok(bridge.status(owner).websocket_connected);
    await bridge.stop(owner);
  } catch (error) {
    error.message += `\n测试服务诊断：${diagnostic}`;
    throw error;
  } finally {
    await bridge?.close();
    server.kill();
    if (savedUrl === undefined) delete process.env.GALATEA_LINK_URL;
    else process.env.GALATEA_LINK_URL = savedUrl;
  }
});
