// 桥接行为测试，验证过期取消、会话隔离与聊天去重
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate as tick } from 'node:timers/promises';
import { GalateaDshBridge, PLUGIN_VERSION, sessionScope } from '../src/bridge.js';
import { registerTools } from '../src/tools.js';

const config = { requestTimeoutMs: 1000, remoteAgentEnabled: true, gameChatEnabled: true,
  chatBudgetMs: 1000, injectDuelSummary: true, allowAgentDeckEdit: false, instanceName: 'Test' };
const owner = { id: 'private-conversation-A' };

// 创建有独立会话身份的有效远程决策请求
function pending(request_id = 1) {
  return { agent_backend: 'remote_dsh', session_id: 'duel-a', request_id, observation_id: 7,
    expires_at: Date.now() / 1000 + 1, observation: {
      legal_actions: [{ choice_id: 0 }, { choice_id: 2 }], game_chat_context: { text: '不能重复处理' },
    } };
}

// 创建不使用网络或模型的可观察桥接测试对象
function setup(run = async () => ({ choice_id: 2, reason: '合法' })) {
  const calls = [];
  const summaries = [];
  let current = pending();
  const client = { token: '',
    // 保存请求并提供当前待处理时点
    async request(method, path, body) {
      calls.push({ method, path, body });
      if (path.endsWith('/pending')) return current;
      return { accepted: true };
    },
  };
  const bridge = new GalateaDshBridge(config, {
    run,
    // 保存一次性摘要以检查所属会话
    injectSummary(agent, summary) { summaries.push({ agent, summary }); },
  }, client);
  bridge.owner = owner;
  return { bridge, calls, summaries, setCurrent(value) { current = value; } };
}

test('同一决策重复到达只生成一次，并剥离旧聊天后提交合法身份', async () => {
  let generations = 0;
  const { bridge, calls } = setup(async (_agent, prompt) => {
    generations++;
    assert.ok(!prompt.includes('不能重复处理'));
    return { choice_id: 2, reason: '选择合法动作' };
  });
  bridge.receiveDecision(pending()); bridge.receiveDecision(pending());
  await tick();
  assert.equal(generations, 1);
  const submit = calls.find(call => call.path === '/api/v1/decisions/1');
  assert.equal(submit.body.agent_backend, 'remote_dsh');
  assert.equal(submit.body.observation_id, 7);
  await bridge.close();
});

test('过期决策与其他后端决策不会调用模型', async () => {
  let calls = 0;
  const { bridge } = setup(async () => { calls++; return {}; });
  bridge.receiveDecision({ ...pending(), expires_at: 1 });
  bridge.receiveDecision({ ...pending(), agent_backend: 'remote_astrbot' });
  await tick();
  assert.equal(calls, 0);
  await bridge.close();
});

test('旧模型即使忽略取消并迟到返回也不能提交早期动作', async () => {
  let resolve;
  const { bridge, calls } = setup(() => new Promise(done => { resolve = done; }));
  bridge.receiveDecision(pending());
  bridge.onEvent({ event_type: 'agent.decision.closed', payload: { session_id: 'duel-a', request_id: 1 } });
  resolve({ choice_id: 2 });
  await tick();
  assert.equal(calls.filter(call => call.method === 'POST').length, 0);
  await bridge.close();
});

test('新决策立即启动而不等待早期挂起的模型', async () => {
  const signals = [];
  const { bridge, calls, setCurrent } = setup((_agent, _prompt, _schema, signal) => {
    signals.push(signal);
    return signals.length === 1 ? new Promise(() => {}) : Promise.resolve({ choice_id: 2 });
  });
  bridge.receiveDecision(pending(1));
  setCurrent(pending(2)); bridge.receiveDecision(pending(2));
  await tick();
  assert.equal(signals.length, 2);
  assert.ok(signals[0].aborted);
  assert.ok(calls.find(call => call.path === '/api/v1/decisions/2'));
  await bridge.close();
});

test('提交前观察身份变化会阻止提交', async () => {
  const { bridge, calls, setCurrent } = setup();
  setCurrent(pending(9));
  bridge.receiveDecision(pending()); await tick();
  assert.equal(calls.filter(call => call.method === 'POST').length, 0);
  await bridge.close();
});

test('对手消息按序号去重且自己的回声不触发生成', async () => {
  let generations = 0;
  const { bridge, calls } = setup(async () => { generations++; return { reply: '你好' }; });
  const message = { role: 'opponent', sequence: 1, text: '你好' };
  bridge.receiveChat(message); bridge.receiveChat(message);
  bridge.receiveChat({ ...message, sequence: 2, echo_of_sequence: 1 });
  await tick();
  assert.equal(generations, 1);
  assert.equal(calls.filter(call => call.path === '/api/v1/chat').length, 1);
  await bridge.close();
});

test('编辑开关与会话身份都在插件入口校验', async () => {
  const { bridge, calls } = setup();
  const tools = new Map();
  registerTools({ tools: { register(tool) { tools.set(tool.name, tool); } } }, bridge);
  const tool = tools.get('galatea_link_edit_current_deck');
  const args = { operations: [{ operation: 'add', code: 123, section: 'main' }] };
  await assert.rejects(tool.execute(args, { agent: owner, signal: new AbortController().signal }), /allowAgentDeckEdit/);
  await assert.rejects(tool.execute(args, { agent: { id: 'other' }, signal: new AbortController().signal }), /另一会话/);
  assert.equal(calls.length, 0);
  assert.notEqual(sessionScope(owner), sessionScope({ id: 'other' }));
  assert.ok(!sessionScope(owner).includes(owner.id));
  await bridge.close();
});

test('赛后摘要只注入所属会话一次', async () => {
  const { bridge, summaries } = setup();
  bridge.finishSummary({ winner: 0 }); bridge.finishSummary({ reason: 'disconnect' });
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].agent, owner);
  assert.equal(bridge.status({ id: 'other' }).last_duel, null);
  await bridge.close();
});

test('对局结束后释放会话绑定并保留原会话可见的赛后摘要', async () => {
  const { bridge } = setup();
  bridge.onEvent({ event_type: 'duel.result', payload: { outcome: 'win' } });
  assert.equal(bridge.owner, null);
  assert.equal(bridge.status(owner).bound_to_current_session, false);
  assert.equal(bridge.status(owner).last_duel.result.outcome, 'win');
  assert.equal(bridge.status({ id: 'other' }).last_duel, null);
  await bridge.close();
});

test('释放绑定后其他会话可以重新配置并持有对局', async () => {
  const { bridge, calls } = setup();
  bridge.onEvent({ event_type: 'service.session.ended', payload: { error: '断线' } });
  const other = { id: 'private-conversation-B' };
  await bridge.configure(other, { decision: { mode: 'hybrid' } }, new AbortController().signal);
  assert.equal(bridge.owner.id, other.id);
  assert.equal(calls.find(call => call.path === '/api/v1/session/configure').body.decision.agent_backend, 'remote_dsh');
  await assert.rejects(bridge.start(owner, new AbortController().signal), /另一会话/);
  await bridge.close();
});

test('心跳上报的插件版本与包描述一致', async () => {
  const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  assert.equal(PLUGIN_VERSION, version);
  const { bridge, calls } = setup();
  bridge.owner = null;
  bridge.closed = false;
  await bridge.poll();
  const beat = calls.find(call => call.path === '/api/v1/integrations/dsh/heartbeat');
  assert.equal(beat.body.plugin_version, version);
  await bridge.close();
});

test('诊断工具不需要会话绑定且输出契约是对象', async () => {
  const { bridge } = setup();
  bridge.owner = null;
  const tools = new Map();
  registerTools({ tools: { register(tool) { tools.set(tool.name, tool); } } }, bridge);
  const exec = { agent: { id: 'unbound' }, signal: new AbortController().signal };
  assert.equal(tools.get('galatea_link_health').output.schema.type, 'object');
  assert.deepEqual(await tools.get('galatea_link_health').execute({}, exec), { accepted: true });
  const readiness = await tools.get('galatea_link_readiness').execute({}, exec);
  assert.equal(readiness.reachable, true);
  assert.equal(readiness.ready_to_start, false);
  assert.equal(readiness.errors.length, 0);
  assert.ok(readiness.warnings.length > 0);
  const server = await tools.get('galatea_link_test_server').execute({}, exec);
  assert.equal(server.ok, true);
  assert.equal(server.accepted, true);
  await bridge.close();
});
