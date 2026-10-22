// Link 网络客户端，统一处理鉴权、请求期限与可取消事件连接
import { readFileSync } from 'node:fs';
import WebSocket from 'ws';

export class LinkClient {
  // 校验服务地址并准备可在运行中更新的令牌来源
  constructor(config) {
    this.config = config;
    const url = new URL(process.env.GALATEA_LINK_URL || config.baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error('Link 地址必须是无凭据与查询参数的 HTTP 地址');
    }
    this.baseUrl = url.href.replace(/\/$/, '');
  }

  // 每次请求时解析令牌，允许文件方式在 dsh 运行中补上或轮换令牌
  get token() {
    const fromEnv = process.env[this.config.apiTokenEnv];
    if (fromEnv) return fromEnv;
    if (this.config.apiTokenFile) {
      try {
        const fromFile = readFileSync(this.config.apiTokenFile, 'utf8').trim();
        if (fromFile) return fromFile;
      } catch { /* 文件尚未生成时回退到配置值 */ }
    }
    return this.config.apiToken || '';
  }

  // 发送带统一超时与调用者取消信号的 JSON 请求
  async request(method, path, body, signal) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const timeout = AbortSignal.timeout(this.config.requestTimeoutMs);
    const response = await fetch(`${this.baseUrl}${path}`, {
      method, headers, redirect: 'error',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    const text = await response.text();
    // 容忍服务端在 5xx 时返回空正文或非 JSON 正文
    let result = null;
    try { result = text ? JSON.parse(text) : null; } catch { result = null; }
    if (!result || typeof result !== 'object') {
      const error = new Error(`Link ${response.status}: 响应不是有效 JSON`);
      error.status = response.status;
      throw error;
    }
    if (!response.ok || result.error) {
      const error = new Error(`Link ${response.status}: ${result.error?.message || '请求失败'}`);
      error.status = response.status;
      error.code = result.error?.code;
      throw error;
    }
    if (result.api_version !== 'galatea.link.api.v1') throw new Error('Link API 版本不兼容');
    return result.data;
  }

  // 创建可传递 Bearer 鉴权头的事件 WebSocket
  connectEvents() {
    const url = new URL(`${this.baseUrl}/api/v1/events`);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return new WebSocket(url, {
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
      handshakeTimeout: this.config.requestTimeoutMs,
      maxPayload: 4 * 1024 * 1024,
      followRedirects: false,
    });
  }
}
