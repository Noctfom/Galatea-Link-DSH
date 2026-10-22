// 插件配置模块，定义 Link 连接与远程智能体功能开关
import Schema from '@deepseek-ai/schemastery';

export const Config = Schema.object({
  baseUrl: Schema.string().default('http://127.0.0.1:8765').description('Link HTTP 地址，环境变量 GALATEA_LINK_URL 优先'),
  apiToken: Schema.string().role('secret').default('').description('Link 访问令牌，建议使用环境变量'),
  apiTokenEnv: Schema.string().default('GALATEA_LINK_API_TOKEN'),
  apiTokenFile: Schema.string().default('').description('令牌文件路径，每次请求时读取，可在不重启 dsh 的情况下更新令牌'),
  autoConnect: Schema.boolean().default(true),
  instanceName: Schema.string().default('DeepSeek Harness'),
  requestTimeoutMs: Schema.number().min(1000).max(120000).default(15000),
  heartbeatIntervalMs: Schema.number().min(3000).max(30000).default(10000),
  reconnectDelayMs: Schema.number().min(500).max(30000).default(3000),
  remoteAgentEnabled: Schema.boolean().default(true),
  gameChatEnabled: Schema.boolean().default(true),
  allowAgentDeckEdit: Schema.boolean().default(false).description('显式允许修改当前会话已经选中的临时对战卡组'),
  injectDuelSummary: Schema.boolean().default(true),
  subagentProvider: Schema.string().default('fork').description('继承当前人格与已完成会话上下文的执行后端'),
  chatBudgetMs: Schema.number().min(1000).max(60000).default(10000),
});
