const fs = require('node:fs');
const path = require('node:path');
const { packDocument, unpackDocument, hash, canonical } = require('./cloud-document.cjs');
const config = require('./cloud-config.cjs');

class CloudSync {
  constructor({ directory, safeStorage, fetchImpl = fetch, readData, emit = () => {}, skipPrompt = false, enabled = true }) {
    Object.assign(this, { directory, safeStorage, fetch: fetchImpl, readData, emit, enabled });
    this.metaFile = path.join(directory, 'cloud-state.json');
    this.sessionFile = path.join(directory, 'cloud-session.enc');
    this.meta = { promptSeen: skipPrompt, ownerId: null, revision: 0, checksum: null, lastSync: null, pending: false };
    this.session = null; this.error = ''; this.conflict = null; this.busy = false;
    this.queue = Promise.resolve();
    this.ready = this.initialize();
  }
  async initialize() {
    try { this.meta = { ...this.meta, ...JSON.parse(fs.readFileSync(this.metaFile, 'utf8')) }; } catch {}
    if (!this.enabled) return;
    try {
      if (fs.existsSync(this.sessionFile)) {
        const decrypted = await this.safeStorage.decryptStringAsync(fs.readFileSync(this.sessionFile));
        this.session = JSON.parse(decrypted.result);
        if (decrypted.shouldReEncrypt) await this.saveSession(this.session);
      }
    } catch { this.error = 'Entre novamente para conectar a nuvem. Seus dados locais estão preservados.'; }
  }
  status() {
    return { enabled: this.enabled, promptSeen: this.meta.promptSeen, user: this.session?.user ? { id: this.session.user.id, email: this.session.user.email } : null,
      busy: this.busy, pending: this.meta.pending, lastSync: this.meta.lastSync, error: this.error,
      conflict: this.conflict ? { updatedAt: this.conflict.updated_at, differentAccount: this.conflict.differentAccount === true } : null };
  }
  publish() { const status = this.status(); this.emit(status); return status; }
  saveMeta() { fs.mkdirSync(this.directory, { recursive: true }); fs.writeFileSync(this.metaFile + '.tmp', JSON.stringify(this.meta)); fs.renameSync(this.metaFile + '.tmp', this.metaFile); }
  async saveSession(session) {
    if (!await this.safeStorage.isAsyncEncryptionAvailable()) throw new Error('O Windows não disponibilizou a proteção da sessão. Continue offline e tente novamente.');
    const encrypted = await this.safeStorage.encryptStringAsync(JSON.stringify(session));
    fs.writeFileSync(this.sessionFile + '.tmp', encrypted); fs.renameSync(this.sessionFile + '.tmp', this.sessionFile);
    this.session = session;
  }
  async run(action) {
    const job = this.queue.catch(() => {}).then(async () => {
      await this.ready; this.busy = true; this.error = ''; this.publish();
      let result;
      try { result = await action(); }
      catch (error) { this.error = error.userMessage || error.message || 'Não foi possível conectar. Seus dados continuam no computador.'; throw new Error(this.error); }
      finally { this.busy = false; this.publish(); }
      return result && Object.hasOwn(result, 'promptSeen') ? this.status() : result;
    });
    this.queue = job; return job;
  }
  async request(endpoint, { method = 'GET', body, binary = false, token = this.session?.access_token, headers = {} } = {}) {
    let response;
    try {
      response = await this.fetch(config.url + endpoint, { method, headers: { apikey: config.key, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body && !Buffer.isBuffer(body) ? JSON.stringify(body) : body, signal: AbortSignal.timeout(15000) });
    } catch { throw new Error('Sem conexão com a nuvem. Seus dados continuam salvos neste computador.'); }
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      const error = new Error(response.status === 401 ? 'Sessão expirada. Entre novamente.' : response.status === 413 ? 'Este arquivo ultrapassa o limite da nuvem.' : detail.error_code === 'email_not_confirmed' ? 'A confirmação de e-mail ainda está habilitada no servidor.' : response.status === 429 ? 'Muitas tentativas. Aguarde um pouco e tente novamente.' : response.status >= 500 ? 'A nuvem está temporariamente indisponível. Tente novamente.' : endpoint.startsWith('/auth/') ? 'Não foi possível entrar. Confira o e-mail e a senha; ao criar conta, use pelo menos 8 caracteres.' : 'Não foi possível sincronizar. Tente novamente.');
      error.status = response.status; throw error;
    }
    if (binary) return Buffer.from(await response.arrayBuffer());
    const text = await response.text(); return text ? JSON.parse(text) : null;
  }
  async token() {
    if (!this.session) throw new Error('Entre para conectar a nuvem.');
    if ((this.session.expires_at || 0) * 1000 < Date.now() + 60000) {
      const session = await this.request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', token: null, body: { refresh_token: this.session.refresh_token } });
      await this.saveSession({ ...session, expires_at: Math.floor(Date.now() / 1000) + session.expires_in });
    }
    return this.session.access_token;
  }
  authenticate(mode, email, password) {
    return this.run(async () => {
      if (!this.enabled) throw new Error('A conexão com a nuvem está indisponível nesta versão.');
      if (!['login', 'signup'].includes(mode) || typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || password.length > 256 || (mode === 'signup' && password.length < 8)) throw new Error('Informe seu e-mail e uma senha válida de pelo menos 8 caracteres.');
      const session = await this.request(mode === 'signup' ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password', { method: 'POST', token: null, body: { email: email.trim(), password } });
      if (!session?.access_token) throw new Error('A confirmação de e-mail ainda está habilitada no servidor. Seus dados locais foram preservados.');
      await this.saveSession({ ...session, expires_at: Math.floor(Date.now() / 1000) + session.expires_in });
      this.meta.promptSeen = true; this.saveMeta(); this.publish();
      try { await this.syncNow(); } catch (error) { this.error = error.message; }
      return this.status();
    });
  }
  skip() { return this.run(async () => { this.meta.promptSeen = true; this.saveMeta(); return this.status(); }); }
  signOut() {
    return this.run(async () => {
      // Local sign-out must work offline. Revocation is attempted without delaying local removal.
      if (this.session) this.request('/auth/v1/logout', { method: 'POST' }).catch(() => {});
      this.session = null; this.conflict = null;
      if (fs.existsSync(this.sessionFile)) fs.unlinkSync(this.sessionFile);
      this.meta.promptSeen = true; this.saveMeta(); return this.status();
    });
  }
  markDirty() {
    if (!this.session || this.meta.pending) return;
    this.meta.pending = true; this.saveMeta(); this.publish();
  }
  async remote() {
    await this.token();
    const rows = await this.request('/rest/v1/organon_sync_state?select=revision,checksum,updated_at&user_id=eq.' + this.session.user.id);
    return rows?.[0] || null;
  }
  sync() { return this.run(() => this.syncNow()); }
  async syncNow({ replace = false, link = false } = {}) {
    if (!this.enabled || !this.session) return this.status();
    if (this.meta.ownerId && this.meta.ownerId !== this.session.user.id && !link) {
      this.conflict = { differentAccount: true }; return this.publish();
    }
    const remote = await this.remote(), local = this.readData();
    if (!local) return this.status();
    if (replace && this.conflict?.revision && remote?.revision !== this.conflict.revision) { this.conflict = remote; return this.publish(); }
    const packed = packDocument(local);
    if (remote?.checksum === packed.checksum) { this.ack(remote); return this.status(); }
    if (remote && !replace && (this.meta.ownerId !== this.session.user.id || remote.revision !== this.meta.revision)) {
      this.conflict = remote; return this.publish();
    }
    if (remote && !replace && packed.checksum === this.meta.checksum) {
      this.conflict = remote; return this.publish();
    }
    const user = this.session.user.id;
    const known = new Set();
    for (let offset = 0; ; offset += 1000) {
      const uploaded = await this.request('/storage/v1/object/list/' + config.bucket, { method: 'POST', body: { prefix: user + '/', limit: 1000, offset } });
      for (const item of uploaded || []) known.add(item.name);
      if (!uploaded || uploaded.length < 1000) break;
    }
    for (const [digest, asset] of packed.assets) {
      if (known.has(digest)) continue;
      try { await this.request('/storage/v1/object/' + config.bucket + '/' + user + '/' + digest, { method: 'POST', body: asset.bytes, headers: { 'Content-Type': asset.type } }); }
      catch (error) { if (error.status !== 409) throw error; }
    }
    const result = await this.request('/rest/v1/rpc/organon_commit_snapshot', { method: 'POST', body: { p_expected_revision: remote?.revision || 0, p_checksum: packed.checksum, p_payload: packed.payload } });
    if (!result?.ok) { this.conflict = result?.current || { updated_at: null }; return this.publish(); }
    this.ack(result.current);
    // Changes made during the upload remain pending for the next sync.
    if (packDocument(this.readData()).checksum !== packed.checksum) { this.meta.pending = true; this.saveMeta(); }
    return this.status();
  }
  ack(remote) {
    this.meta = { ...this.meta, ownerId: this.session.user.id, revision: remote.revision, checksum: remote.checksum, lastSync: new Date().toISOString(), pending: false };
    this.conflict = null; this.saveMeta(); this.publish();
  }
  chooseLocal() { return this.run(() => this.syncNow({ replace: true, link: true })); }
  download() {
    return this.run(async () => {
      await this.token();
      const rows = await this.request('/rest/v1/organon_sync_state?select=*&user_id=eq.' + this.session.user.id);
      const row = rows?.[0]; if (!row) throw new Error('Esta conta ainda não tem uma cópia online.');
      if (hash(canonical(row.payload)) !== row.checksum) throw new Error('O backup online não passou na verificação de integridade.');
      const data = await unpackDocument(row.payload, digest => this.request('/storage/v1/object/authenticated/' + config.bucket + '/' + this.session.user.id + '/' + digest, { binary: true }));
      const local = this.readData();
      if (local) {
        const recovery = path.join(this.directory, 'recovery'); fs.mkdirSync(recovery, { recursive: true });
        fs.writeFileSync(path.join(recovery, `before-cloud-${Date.now()}.json`), JSON.stringify(local));
      }
      this.downloaded = { revision: row.revision, checksum: row.checksum };
      return data;
    });
  }
  acceptDownload() { return this.run(async () => { if (!this.downloaded) throw new Error('Nenhum backup foi carregado.'); this.ack(this.downloaded); this.downloaded = null; return this.status(); }); }
}
module.exports = { CloudSync };
