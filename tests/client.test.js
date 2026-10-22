// Link 客户端令牌解析测试，验证文件方式可在 dsh 运行中更新令牌
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LinkClient } from '../src/client.js';

// 构造只关心令牌来源的最小配置
function client(config) {
  return new LinkClient({ baseUrl: 'http://127.0.0.1:8765', apiTokenEnv: 'GALATEA_LINK_TEST_TOKEN', ...config });
}

// 在清除地址与令牌环境变量的干净环境中执行断言
async function isolated(run) {
  const savedUrl = process.env.GALATEA_LINK_URL;
  const savedToken = process.env.GALATEA_LINK_TEST_TOKEN;
  delete process.env.GALATEA_LINK_URL;
  delete process.env.GALATEA_LINK_TEST_TOKEN;
  try { await run(); } finally {
    if (savedUrl === undefined) delete process.env.GALATEA_LINK_URL;
    else process.env.GALATEA_LINK_URL = savedUrl;
    if (savedToken === undefined) delete process.env.GALATEA_LINK_TEST_TOKEN;
    else process.env.GALATEA_LINK_TEST_TOKEN = savedToken;
  }
}

test('令牌按环境变量、文件、配置的顺序解析且支持运行中轮换', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'galatea-token-'));
  const file = path.join(dir, 'token');
  await isolated(async () => {
    writeFileSync(file, '  from-file \n');
    const instance = client({ apiToken: 'from-config', apiTokenFile: file });
    assert.equal(instance.token, 'from-file');
    writeFileSync(file, 'rotated');
    assert.equal(instance.token, 'rotated');
    process.env.GALATEA_LINK_TEST_TOKEN = 'from-env';
    assert.equal(instance.token, 'from-env');
    delete process.env.GALATEA_LINK_TEST_TOKEN;
    writeFileSync(file, '   \n');
    assert.equal(instance.token, 'from-config');
    const missing = client({ apiToken: 'only-config', apiTokenFile: path.join(dir, 'missing') });
    assert.equal(missing.token, 'only-config');
  });
  rmSync(dir, { recursive: true, force: true });
});

test('拒绝带凭据、查询参数或非 HTTP 的 Link 地址', async () => {
  await isolated(async () => {
    assert.throws(() => client({ baseUrl: 'http://user:pass@127.0.0.1:8765' }), /必须是无凭据/);
    assert.throws(() => client({ baseUrl: 'http://127.0.0.1:8765/?token=x' }), /必须是无凭据/);
    assert.throws(() => client({ baseUrl: 'ftp://127.0.0.1:8765' }), /必须是无凭据/);
  });
});
