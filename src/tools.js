// dsh 原生工具定义，提供受会话约束的对局操作与结构化结果
import { sessionScope } from './bridge.js';

const string = { type: 'string' };
const number = { type: 'number' };
const integer = { type: 'integer' };
const boolean = { type: 'boolean' };
const section = { type: 'string', enum: ['main', 'extra', 'side'] };
// 统一的开放对象输出契约，保持可校验且不误伤 Link 的扩展字段
const response = { type: 'object', additionalProperties: true };

// 构造明确拒绝未知字段的对象参数
function object(properties, required = []) {
  return { type: 'object', properties, required, additionalProperties: false };
}

// 在原始 JSON Schema 工具的执行边界检查必填与基础类型
function validate(schema, value) {
  if (schema.type === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('工具参数必须是对象');
    for (const key of schema.required || []) if (!(key in value)) throw new Error(`缺少参数 ${key}`);
    for (const [key, item] of Object.entries(value)) {
      const property = schema.properties?.[key];
      if (!property && schema.additionalProperties === false) throw new Error(`未知参数 ${key}`);
      if (property) validate(property, item);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) throw new Error('参数必须是数组');
    for (const item of value) validate(schema.items, item);
  } else {
    const actual = schema.type === 'integer' ? Number.isSafeInteger(value) : typeof value === schema.type;
    if (!actual || schema.enum && !schema.enum.includes(value) || typeof value === 'number' && !Number.isFinite(value)) throw new Error('工具参数类型或范围无效');
  }
}

// 汇总 Link 是否具备开局条件，单项失败写入 errors 而不中断整次诊断
async function readReadiness(client, signal) {
  const errors = [];
  // 读取一个诊断端点并把失败收集为普通结果
  async function read(method, path, body) {
    try { return await client.request(method, path, body, signal); }
    catch (error) { errors.push({ step: path, message: error.message }); return null; }
  }
  const [health, status, models, assets, capabilities, configuration] = await Promise.all([
    read('GET', '/api/v1/health'),
    read('GET', '/api/v1/status'),
    read('GET', '/api/v1/models'),
    read('GET', '/api/v1/assets'),
    read('GET', '/api/v1/capabilities'),
    read('GET', '/api/v1/session/configuration'),
  ]);
  const backends = capabilities?.remote_agent_decisions?.backends || [];
  const selected = (models?.models || []).find(item => item.selected) || null;
  const warnings = [];
  if (health === null) warnings.push('Link 无法访问，请检查地址与令牌');
  if (capabilities && !backends.includes('remote_dsh')) warnings.push('Link 未声明 remote_dsh 后端，需要更新 Link');
  if (models && !selected) warnings.push('尚未选择模型，需要先在 Link 导入并选中模型才能开局');
  if (selected && selected.assets_available === false) warnings.push('所选模型的运行资产缺失，需要补齐该模型的 V3 资产');
  if (assets?.card_database && assets.card_database.exists === false) warnings.push('卡数据库缺失，需要先同步卡数据库');
  if (assets && assets.semantic_complete === false) warnings.push('语义资产不完整，Core 推理可能不可用');
  return {
    reachable: health !== null,
    ready_to_start: warnings.length === 0,
    link_version: health?.version ?? capabilities?.link_version ?? null,
    session_state: health?.session_state ?? status?.state ?? null,
    running: status?.running ?? null,
    remote_dsh_supported: backends.includes('remote_dsh'),
    backends,
    selected_model: selected ? {
      primary: selected.primary, format: selected.format,
      size_bytes: selected.size_bytes, assets_available: selected.assets_available,
    } : null,
    model_count: Array.isArray(models?.models) ? models.models.length : null,
    invalid_models: (models?.invalid || []).map(item => item.file),
    assets: assets ? {
      card_database: assets.card_database ?? null,
      semantic_complete: assets.semantic_complete ?? null,
      script_count: assets.script_count ?? null,
    } : null,
    server: configuration?.server ? {
      host: configuration.server.host, port: configuration.server.port,
      protocol_version: configuration.server.protocol_version,
      password_configured: configuration.server.password_configured,
    } : null,
    decision: configuration?.decision ? {
      mode: configuration.decision.mode,
      agent_backend: configuration.decision.agent_backend,
      llm_time_budget: configuration.decision.llm_time_budget,
    } : null,
    warnings, errors,
  };
}

// 注册独立于 dsh 具体版本的原生 JSON Schema 工具
export function registerTools(ctx, bridge) {
  // 统一创建符合宿主规范且响应取消的工具定义
  function register(name, description, properties, execute, required = []) {
    const parameters = object(properties, required);
    ctx.tools.register({
      name, description, parameters,
      output: { schema: response,
        // 把结构化结果展示为模型可读文本
        render(_args, value) { return [{ type: 'text', text: JSON.stringify(value) }]; },
      },
      // 执行前校验原始工具参数并使用宿主提供的身份与取消信号
      async execute(args, exec) {
        exec.signal.throwIfAborted();
        validate(parameters, args);
        return execute(args, exec.agent, exec.signal);
      },
    });
  }

  register('galatea_link_status', '检查 Link、dsh 插件连接状态及当前会话最近赛后摘要', {}, async (_args, owner, signal) => ({
    bridge: bridge.status(owner),
    link: await bridge.client.request('GET', '/api/v1/status', undefined, signal).then(status => bridge.owner?.id === owner.id ? status : { state: status.state, running: status.running, link_version: status.link_version, integrations: status.integrations }),
  }));
  register('galatea_link_health', '检查 Link 服务是否在线与当前会话状态，不需要先绑定对局', {}, (_args, _owner, signal) =>
    bridge.client.request('GET', '/api/v1/health', undefined, signal));
  register('galatea_link_readiness', '汇总 Link 是否具备开局条件，含模型、运行资产、卡数据库、remote_dsh 与服务器配置，不需要先绑定对局', {}, (_args, _owner, signal) =>
    readReadiness(bridge.client, signal));
  register('galatea_link_test_server', '测试当前或指定的 YGOPro 服务器能否连接，只做连通性检查且不修改任何配置', {
    host: string, port: integer, password: string,
  }, async (args, _owner, signal) => {
    const server = {};
    if (args.host !== undefined) server.host = args.host;
    if (args.port !== undefined) server.port = args.port;
    if (args.password !== undefined) server.password = args.password;
    // 空补丁会直接使用会话地址，这里先补齐当前主机与端口以便显式测试
    if (server.host === undefined || server.port === undefined) {
      try {
        const current = await bridge.client.request('GET', '/api/v1/session/configuration', undefined, signal);
        if (server.host === undefined && current?.server?.host) server.host = current.server.host;
        if (server.port === undefined && current?.server?.port) server.port = current.server.port;
      } catch { /* 读取失败时交给下面的请求返回真实原因 */ }
    }
    try {
      const result = await bridge.client.request('POST', '/api/v1/configuration/server/test', { patch: { server } }, signal);
      return { ...result, ok: result.ok !== false };
    } catch (error) {
      // 连不上属于可诊断结果，不当作工具故障抛出
      const failed = { schema_version: 'galatea.link.server_test.v1', ok: false,
        host: server.host ?? null, port: server.port ?? null, error: error.message };
      // Link 把连接失败统一映射为 5xx，这里补充可操作的判断提示
      if (error.status >= 500) failed.hint = 'Link 将连接失败统一返回 5xx，通常表示目标服务器未开放或地址不可达';
      return failed;
    }
  });
  register('galatea_link_list_decks', '列出 Link 公共本地卡组与当前 dsh 会话隔离临时卡组，包含卡名、数量、来源', {}, (_args, owner, signal) =>
    bridge.client.request('POST', '/api/v1/decks/query', { scope_id: sessionScope(owner) }, signal));
  register('galatea_link_import_deck', '将用户提供的 YDK 文本导入为当前会话临时卡组并选中', {
    display_name: string, ydk_text: string,
  }, (args, owner, signal) => bridge.importDeck(owner, args, signal), ['display_name', 'ydk_text']);

  register('galatea_link_configure_session', '配置本次 YGOPro 服务器、密码、卡组与介入模式，只将 LLM 后端替换为 dsh，未传模式时保留 Link 现有模式', {
    server: object({ host: string, port: integer, password: string, protocol_version: integer }),
    agent: object({ name: string, deck: string, prefer_second: boolean }),
    decision: object({ mode: { type: 'string', enum: ['core_only', 'hybrid', 'llm_review', 'llm_only'] },
      llm_time_budget: number, core_time_budget: number, core_confidence_threshold: number,
      core_temperature: number, core_policy_mode: { type: 'string', enum: ['greedy', 'deployment'] } }),
  }, (args, owner, signal) => bridge.configure(owner, args, signal));
  register('galatea_link_start_duel', '启动当前会话已配置的 YGOPro 对局，后台自动处理限时决策与聊天', {}, (_args, owner, signal) => bridge.start(owner, signal));
  register('galatea_link_stop_duel', '停止当前 dsh 会话持有的对局并释放绑定', {}, (_args, owner, signal) => bridge.stop(owner, signal));
  register('galatea_link_observation', '读取当前对局玩家可见观察与合法动作，不提供隐藏卡片', {}, (_args, owner, signal) => {
    bridge.assertOwner(owner);
    return bridge.client.request('GET', '/api/v1/observation', undefined, signal);
  });
  register('galatea_link_game_chat', '向当前会话持有的 YGOPro 对局发送短消息', { text: string }, (args, owner, signal) => {
    bridge.assertOwner(owner);
    return bridge.client.request('POST', '/api/v1/chat', { text: args.text }, signal);
  }, ['text']);
  register('galatea_link_edit_current_deck', '仅在显式开启编辑权限后调整当前会话已经选中的临时对战卡组，支持禁限卡适配', {
    operations: { type: 'array', items: object({ operation: { type: 'string', enum: ['add', 'remove', 'move'] },
      code: integer, count: integer, section, to_section: section }, ['operation', 'code']) },
  }, (args, owner, signal) => {
    bridge.assertOwner(owner);
    if (!bridge.config.allowAgentDeckEdit) throw new Error('请先在插件配置显式开启 allowAgentDeckEdit');
    return bridge.client.request('PATCH', '/api/v1/decks/current', { scope_id: sessionScope(owner), operations: args.operations }, signal);
  }, ['operations']);
  register('galatea_link_controls', '读取或更新介入策略与自主调整开关，需要在配置过会话后使用', {
    intervention: object({ mode: { type: 'string', enum: ['core_only', 'hybrid', 'llm_review', 'llm_only'] },
      core_confidence_threshold: number, core_temperature: number, llm_time_budget: number }),
    autonomous_intervention_enabled: boolean,
  }, async (args, owner, signal) => {
    bridge.assertOwner(owner);
    const current = await bridge.client.request('GET', '/api/v1/controls', undefined, signal);
    if (!Object.keys(args).length) return current;
    const patch = {};
    if (args.intervention) patch.intervention = args.intervention;
    if ('autonomous_intervention_enabled' in args) patch.autonomy = { enabled: args.autonomous_intervention_enabled };
    return bridge.client.request('PATCH', '/api/v1/controls', { patch, expected_revision: current.revision }, signal);
  });
  register('galatea_link_submit_decision', '手动提交尚未过期的合法动作，正常情况下由插件后台自动完成', {
    request_id: integer, session_id: string, observation_id: integer, choice_id: integer, reason: string,
  }, (args, owner, signal) => {
    bridge.assertOwner(owner);
    return bridge.client.request('POST', `/api/v1/decisions/${args.request_id}`, { ...args, agent_backend: 'remote_dsh' }, signal);
  }, ['request_id', 'session_id', 'observation_id', 'choice_id']);
}
