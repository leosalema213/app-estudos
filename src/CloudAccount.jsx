import { useEffect, useRef, useState } from 'react';
import { Cloud, CloudOff, RefreshCw, LogOut } from 'lucide-react';
import wordmark from '../assets/branding/organon-wordmark.svg';
import './cloud.css';
import { waitForImages } from './images.js';

export function useCloudAccount(ready, { flush, restore }) {
  const [status, setStatus] = useState(null), [open, setOpen] = useState(false), [error, setError] = useState('');
  const callbacks = useRef(); callbacks.current = { flush, restore };
  useEffect(() => {
    if (!ready || !window.desktop?.cloud) return;
    let mounted = true;
    const unsubscribe = window.desktop.cloud.onStatus(value => { if (mounted) setStatus(value); });
    window.desktop.cloud.status().then(value => {
      if (!mounted) return;
      setStatus(value); setOpen(value.enabled !== false && !value.promptSeen && !value.user);
      if (value.user) window.desktop.cloud.sync().catch(() => {});
    }).catch(() => setError('Não foi possível consultar a conta. Continue offline.'));
    const close = window.desktop.cloud.onPrepareClose(async () => {
      await waitForImages();
      await callbacks.current.flush(true);
      window.desktop.cloud.closeReady().catch(() => {});
    });
    return () => { mounted = false; unsubscribe(); close(); };
  }, [ready]);
  async function call(action) {
    setError('');
    try { const value = await action(); if (value) setStatus(value); return value; }
    catch (error) { setError(error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); return null; }
  }
  return { status, open, error,
    show: () => { setError(''); setOpen(true); },
    close: async () => { if (await call(() => window.desktop.cloud.skip())) setOpen(false); },
    authenticate: async (mode, email, password) => {
      if (!await callbacks.current.flush(false)) { setError('Salve um backup antes de conectar: o salvamento local falhou.'); return; }
      const value = await call(() => window.desktop.cloud.authenticate(mode, email, password));
      if (value?.user) setOpen(false);
    },
    sync: () => call(async () => { if (!await callbacks.current.flush(false)) throw new Error('Não foi possível salvar os dados locais.'); return window.desktop.cloud.sync(); }),
    signOut: () => call(() => window.desktop.cloud.signOut()),
    chooseLocal: () => call(async () => { if (!await callbacks.current.flush(false)) throw new Error('Não foi possível salvar os dados locais.'); return window.desktop.cloud.chooseLocal(); }),
    chooseRemote: () => call(async () => {
      if (!await callbacks.current.flush(true)) throw new Error('Não foi possível preservar seus dados locais.');
      const data = await window.desktop.cloud.download();
      if (!await callbacks.current.restore(data)) throw new Error('Não foi possível salvar o backup neste computador.');
      return window.desktop.cloud.acceptDownload();
    }),
  };
}

export function AccountDialog({ account, Modal }) {
  const [mode, setMode] = useState('login'), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false);
  const disabled = busy || account.status?.busy;
  async function submit(event) {
    event.preventDefault(); setBusy(true);
    try { await account.authenticate(mode, email, password); } finally { setBusy(false); setPassword(''); }
  }
  return <Modal title="Sua conta" small className="account-modal" onClose={() => !disabled && account.close()}>
    <span className="account-wordmark" style={{ maskImage: `url(${wordmark})` }} role="img" aria-label="Organon" />
    <p className="account-intro">Seu espaço, onde você estiver.</p>
    <div className="account-tabs" role="tablist" aria-label="Acesso à conta">
      <button role="tab" aria-selected={mode === 'login'} onClick={() => { setMode('login'); setPassword(''); }} disabled={disabled}>Entrar</button>
      <button role="tab" aria-selected={mode === 'signup'} onClick={() => { setMode('signup'); setPassword(''); }} disabled={disabled}>Criar conta</button>
    </div>
    <form className="account-form" onSubmit={submit}>
      <label>E-mail<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={disabled} /></label>
      <label>Senha<input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={mode === 'signup' ? 8 : 1} maxLength={256} placeholder={mode === 'signup' ? 'Pelo menos 8 caracteres' : ''} value={password} onChange={event => setPassword(event.target.value)} disabled={disabled} /></label>
      {account.error && <p className="form-error" role="alert">{account.error}</p>}
      <button className="primary" type="submit" disabled={disabled}>{disabled ? 'Conectando…' : mode === 'signup' ? 'Criar minha conta' : 'Entrar na minha conta'}</button>
      <button className="account-offline" type="button" onClick={account.close} disabled={disabled}><CloudOff size={14} />Continuar offline</button>
    </form>
  </Modal>;
}

export function CloudPanel({ account }) {
  const [choice, setChoice] = useState(null);
  const status = account.status;
  if (!window.desktop?.cloud) return <p>A conexão com a nuvem está disponível no aplicativo para Windows.</p>;
  return <div className="preference-section cloud-panel">
    <div className="cloud-heading"><Cloud size={21} /><div><h3>{status?.user ? 'Sua conta' : 'Seu espaço na nuvem'}</h3><p>{status?.user?.email || 'Conecte quando quiser. Seus dados continuam neste computador.'}</p></div></div>
    {!status?.user ? <button className="primary" onClick={account.show}>Entrar ou criar conta</button> : <>
      <p role="status">{status.busy ? 'Sincronizando…' : status.conflict ? 'Há dados para conferir antes de sincronizar.' : status.pending ? 'Alterações salvas neste computador. Envio pendente.' : status.lastSync ? `Última sincronização: ${new Date(status.lastSync).toLocaleString('pt-BR')}` : 'Pronto para sincronizar.'}</p>
      {status.conflict && <div className="cloud-conflict">
        <strong>{status.conflict.differentAccount ? 'Estes dados locais estavam vinculados a outra conta.' : 'Este computador e a nuvem têm cópias diferentes.'}</strong>
        <p>Escolha qual cópia usar. Ao trazer a nuvem, guardamos uma cópia de recuperação dos dados locais.</p>
        {!choice ? <div className="button-row"><button className="secondary" disabled={status.busy} onClick={() => setChoice('local')}>Usar dados deste computador</button><button className="secondary" disabled={status.busy} onClick={() => setChoice('remote')}>Trazer dados da nuvem</button></div> : <>
          <p>{choice === 'local' ? 'Substituir a cópia online desta conta pelos dados deste computador?' : 'Substituir os dados deste computador pela cópia online desta conta?'}</p>
          <div className="button-row"><button className="primary" disabled={status.busy} onClick={async () => { await (choice === 'local' ? account.chooseLocal() : account.chooseRemote()); setChoice(null); }}>Confirmar escolha</button><button className="secondary" onClick={() => setChoice(null)} disabled={status.busy}>Cancelar</button></div>
        </>}
      </div>}
      <div className="button-row"><button className="primary" onClick={account.sync} disabled={status.busy || !!status.conflict}><RefreshCw size={15} />Sincronizar agora</button><button className="secondary" onClick={account.signOut} disabled={status.busy}><LogOut size={15} />Sair da conta</button></div>
      <p>Envia ao abrir, ao fechar e durante o uso após um dia, somente quando há mudanças.</p>
    </>}
    {(account.error || status?.error) && <p className="form-error" role="alert">{account.error || status.error}</p>}
  </div>;
}
