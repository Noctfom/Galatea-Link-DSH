// dsh 执行适配层，兼容本地旧版与当前版本的异步结构化任务
import { randomUUID } from 'node:crypto';

export class HarnessRunner {
  // 保存宿主能力并在现代任务创建窗口限制可调用工具
  constructor(ctx, provider) {
    this.ctx = ctx;
    this.provider = provider;
    this.childIds = new Set();
    ctx.on('agent/created', ({ agent }) => {
      if (!this.childIds.has(String(agent.id))) return;
      const denied = agent.ctx.tools.schemas(agent).map(tool => tool.name).filter(name => !['structured_output', 'run_code'].includes(name));
      if (denied.length) agent.ctx.tools.restrict({ deny: denied });
      agent.ctx.tools.guard(exec => ['structured_output', 'run_code'].includes(exec.name) ? undefined : '游戏后台任务只允许提交结构化结果');
    });
  }

  // 继承当前 dsh 模型与已完成上下文并在取消后释放独立任务
  async run(owner, prompt, schema, signal) {
    signal.throwIfAborted();
    let run;
    let cancelListener;
    const childId = `galatea-${randomUUID()}`;
    this.childIds.add(childId);
    try {
      const request = { parent: owner, prompt: [{ type: 'text', text: prompt }], outputSchema: schema };
      if (typeof this.ctx.subagents.startActivation === 'function') {
        run = await this.ctx.subagents.startActivation({
          provider: this.provider, label: 'Galatea 限时游戏任务', childId,
          request, signal, delivery: 'caller',
        });
      } else if (typeof this.ctx.subagents.start === 'function') {
        const denied = owner.ctx.tools.schemas(owner).map(tool => tool.name).filter(name => !['structured_output', 'run_code'].includes(name));
        run = await this.ctx.subagents.start(this.provider, {
          ...request, label: 'Galatea 限时游戏任务', signal,
          toolFilter: { deny: denied },
        });
      } else {
        throw new Error('当前 dsh 缺少受支持的 subagents 执行接口');
      }
      signal.throwIfAborted();
      const aborted = new Promise((_, reject) => {
        cancelListener = () => reject(signal.reason || new Error('游戏任务已取消'));
        signal.addEventListener('abort', cancelListener, { once: true });
      });
      const result = await Promise.race([run.result, aborted]);
      signal.throwIfAborted();
      if (result.stopReason !== 'completed' || !result.structured || typeof result.structured !== 'object') {
        throw new Error('dsh 未返回成功的结构化游戏结果');
      }
      return result.structured;
    } finally {
      this.childIds.delete(childId);
      if (cancelListener) signal.removeEventListener('abort', cancelListener);
      if (run) {
        // 清理不阻塞事件接收与后续决策，释放失败由调用方诊断
        Promise.resolve(run.dispose()).catch(() => {});
      }
    }
  }

  // 将有界赛后摘要注入原会话且不额外唤醒模型
  injectSummary(owner, summary) {
    owner.inject({
      id: randomUUID(), role: 'user', source: { kind: 'galatea-link' },
      content: [{ type: 'text', text: `Galatea 对局摘要，仅作为已结束事件记忆：${JSON.stringify(summary)}` }],
    });
  }
}
