/**
 * Página de Login com 2FA obrigatório
 * Etapas: 'login' → 'choose-method' → 'verify-code' → ('terms')
 *
 * A seleção obrigatória de cliente para admins/multi-restaurante deixou de
 * ser uma etapa do login: agora ela aparece como modal bloqueante dentro do
 * Layout assim que o usuário entra.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './LoginPage.css';

function LoginPage() {
  const [etapa, setEtapa] = useState('login'); // 'login' | 'choose-method' | 'verify-code' | 'terms'
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [lembrar, setLembrar] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Estado do 2FA
  const [challengeToken, setChallengeToken] = useState('');
  const [contato, setContato] = useState({ email_mask: null, celular_mask: null, tem_email: false, tem_celular: false });
  const [metodoEscolhido, setMetodoEscolhido] = useState(null);
  const [codigo, setCodigo] = useState('');

  // Etapa termos
  const [aceiteMarcado, setAceiteMarcado] = useState(false);

  const { iniciarLogin, enviar2FA, verificar2FA, aceitarTermos, cancelarAuthPendente } = useAuth();
  const navigate = useNavigate();

  const errorMsg = (err, fallback) =>
    err.response?.data?.error || err.response?.data?.message || (err.request ? 'Servidor indisponível. Verifique sua conexão.' : fallback);

  const handleSubmitLogin = async (e) => {
    e.preventDefault();
    setErro('');

    if (!login.trim() || !senha.trim()) {
      setErro('Preencha todos os campos');
      return;
    }

    setEnviando(true);
    try {
      const resp = await iniciarLogin(login.trim(), senha);
      setChallengeToken(resp.challenge_token);
      setContato(resp.contato || {});
      setEtapa('choose-method');
    } catch (err) {
      setErro(errorMsg(err, 'Erro ao fazer login'));
    } finally {
      setEnviando(false);
    }
  };

  const handleEscolherMetodo = async (metodo) => {
    setErro('');
    setEnviando(true);
    try {
      const resp = await enviar2FA(challengeToken, metodo);
      setChallengeToken(resp.challenge_token);
      setMetodoEscolhido(metodo);
      setCodigo('');
      setEtapa('verify-code');
    } catch (err) {
      setErro(errorMsg(err, 'Erro ao enviar código'));
    } finally {
      setEnviando(false);
    }
  };

  const handleVerificarCodigo = async (e) => {
    e.preventDefault();
    setErro('');
    if (!/^\d{6}$/.test(codigo)) {
      setErro('Informe os 6 dígitos do código');
      return;
    }
    setEnviando(true);
    try {
      const resp = await verificar2FA(challengeToken, codigo, lembrar);
      if (resp.senhaTemporaria) {
        navigate('/trocar-senha');
        return;
      }
      if (resp.precisaAceitarTermos) {
        setAceiteMarcado(false);
        setEtapa('terms');
        return;
      }
      // Login efetivado. Se for admin ou multi-restaurante, o modal bloqueante
      // do Layout cuida da seleção obrigatória — basta navegar.
      navigate('/dashboard');
    } catch (err) {
      setErro(errorMsg(err, 'Erro ao validar código'));
    } finally {
      setEnviando(false);
    }
  };

  const handleAceitarTermos = async () => {
    if (!aceiteMarcado || enviando) return;
    setErro('');
    setEnviando(true);
    try {
      await aceitarTermos();
      navigate('/dashboard');
    } catch (err) {
      setErro(errorMsg(err, 'Erro ao registrar aceite'));
    } finally {
      setEnviando(false);
    }
  };

  const voltarPara = (destino) => {
    setErro('');
    setCodigo('');
    if (destino === 'login') {
      setChallengeToken('');
      setMetodoEscolhido(null);
      setEtapa('login');
    } else if (destino === 'choose-method') {
      setEtapa('choose-method');
    }
  };

  const logoUrl = `${process.env.PUBLIC_URL}/images/logo-rosa-branca.png`;

  return (
    <div
      className="login-page"
      style={{ backgroundImage: `url(${process.env.PUBLIC_URL}/images/novologin.png)` }}
    >
      <div className="login-branding">
        <img src={logoUrl} alt="BR Gorjeta" className="login-logo" />
        <p className="login-tagline">
          <span className="login-tagline-white">Solução inteligente para a</span>
          <br />
          <span className="login-tagline-pink">gestão de gorjetas</span>
        </p>
        <p className="login-site">brgorjeta.com.br</p>
      </div>

      {/* Etapa 1 — Login + Senha */}
      {etapa === 'login' && (
        <form className="login-card" onSubmit={handleSubmitLogin}>
          <h2>Login</h2>
          {erro && <div className="login-error">{erro}</div>}

          <div className="login-field">
            <input
              type="text"
              placeholder="Usuário"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoFocus
              disabled={enviando}
            />
          </div>

          <div className="login-field" style={{ position: 'relative' }}>
            <input
              type={mostrarSenha ? 'text' : 'password'}
              placeholder="Senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              disabled={enviando}
              style={{ paddingRight: '40px' }}
            />
            <button
              type="button"
              onClick={() => setMostrarSenha(!mostrarSenha)}
              style={{
                position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                color: 'rgba(255,255,255,0.6)', fontSize: '18px'
              }}
              tabIndex={-1}
            >
              {mostrarSenha ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>

          <label className="login-lembrar">
            <input
              type="checkbox"
              checked={lembrar}
              onChange={(e) => setLembrar(e.target.checked)}
              disabled={enviando}
            />
            <span>Lembrar-me</span>
          </label>

          <button type="submit" className="login-btn" disabled={enviando}>
            {enviando ? 'Entrando...' : 'Entrar'}
          </button>

          <div className="login-esqueci">
            <a href="/esqueci-senha" onClick={(e) => { e.preventDefault(); navigate('/esqueci-senha'); }}>
              Esqueci minha Senha
            </a>
          </div>
        </form>
      )}

      {/* Etapa 2 — Escolha do método */}
      {etapa === 'choose-method' && (
        <div className="login-card">
          <h2>Verificação em 2 etapas</h2>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', margin: '0 0 18px', lineHeight: '1.5' }}>
            Como deseja receber o código de verificação?
          </p>
          {erro && <div className="login-error">{erro}</div>}

          <button
            type="button"
            className="login-btn"
            onClick={() => handleEscolherMetodo('email')}
            disabled={enviando || !contato.tem_email}
            style={{ marginBottom: '10px' }}
          >
            {enviando && metodoEscolhido === 'email' ? 'Enviando...' : `Email${contato.email_mask ? ` (${contato.email_mask})` : ''}`}
          </button>

          <button
            type="button"
            className="login-btn"
            onClick={() => handleEscolherMetodo('sms')}
            disabled={enviando || !contato.tem_celular}
            style={{ marginBottom: '14px' }}
          >
            {enviando && metodoEscolhido === 'sms' ? 'Enviando...' : `SMS${contato.celular_mask ? ` (${contato.celular_mask})` : ''}`}
          </button>

          {!contato.tem_email && !contato.tem_celular && (
            <p style={{ color: '#fca5a5', fontSize: '12px', margin: '0 0 12px', textAlign: 'center' }}>
              Nenhum email ou celular cadastrado — contate o suporte.
            </p>
          )}

          <div className="login-esqueci">
            <a href="#" onClick={(e) => { e.preventDefault(); voltarPara('login'); }}>
              Voltar
            </a>
          </div>
        </div>
      )}

      {/* Etapa 3 — Inserir código */}
      {etapa === 'verify-code' && (
        <form className="login-card" onSubmit={handleVerificarCodigo}>
          <h2>Código de verificação</h2>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', margin: '0 0 18px', lineHeight: '1.5' }}>
            Enviamos um código de 6 dígitos por <strong>{metodoEscolhido === 'email' ? 'email' : 'SMS'}</strong>
            {metodoEscolhido === 'email' && contato.email_mask ? ` para ${contato.email_mask}` : ''}
            {metodoEscolhido === 'sms' && contato.celular_mask ? ` para ${contato.celular_mask}` : ''}.
          </p>
          {erro && <div className="login-error">{erro}</div>}

          <div className="login-field">
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              placeholder="000000"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
              autoFocus
              disabled={enviando}
              style={{ textAlign: 'center', fontSize: '22px', letterSpacing: '8px', fontFamily: 'monospace' }}
            />
          </div>

          <button type="submit" className="login-btn" disabled={enviando}>
            {enviando ? 'Validando...' : 'Validar código'}
          </button>

          <div className="login-esqueci" style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
            <a href="#" onClick={(e) => { e.preventDefault(); voltarPara('choose-method'); }}>
              Trocar método
            </a>
            <a href="#" onClick={(e) => { e.preventDefault(); voltarPara('login'); }}>
              Cancelar
            </a>
          </div>
        </form>
      )}

      {/* Etapa 4 — Aceite dos termos de uso (primeiro acesso) */}
      {etapa === 'terms' && (
        <div className="login-card">
          <h2>Termos de Uso</h2>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', margin: '0 0 14px', lineHeight: '1.5' }}>
            Para continuar, leia e aceite os Termos de Uso da plataforma.
          </p>
          {erro && <div className="login-error">{erro}</div>}

          <a
            href="https://brgorjeta.com.br/terms-platform/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block', textAlign: 'center', padding: '10px',
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: '8px', color: '#F9678C', textDecoration: 'none',
              fontSize: '13px', fontWeight: 600, marginBottom: '14px'
            }}
          >
            Abrir Termos de Uso ↗
          </a>

          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: '10px',
            color: 'rgba(255,255,255,0.85)', fontSize: '13px',
            cursor: enviando ? 'not-allowed' : 'pointer',
            marginBottom: '14px', lineHeight: '1.4'
          }}>
            <input
              type="checkbox"
              checked={aceiteMarcado}
              onChange={(e) => setAceiteMarcado(e.target.checked)}
              disabled={enviando}
              style={{ marginTop: '2px' }}
            />
            <span>Li e aceito os <strong>Termos de Uso</strong> da BR Gorjeta.</span>
          </label>

          <button
            type="button"
            className="login-btn"
            onClick={handleAceitarTermos}
            disabled={enviando || !aceiteMarcado}
            style={{ opacity: aceiteMarcado ? 1 : 0.6 }}
          >
            {enviando ? 'Registrando...' : 'Aceitar e continuar'}
          </button>

          <div className="login-esqueci">
            <a href="#" onClick={(e) => { e.preventDefault(); cancelarAuthPendente(); voltarPara('login'); }}>
              Cancelar
            </a>
          </div>
        </div>
      )}

      <div className="login-branding-compact">
        <img src={logoUrl} alt="BR Gorjeta" className="login-logo-compact" />
        <p className="login-site-compact">brgorjeta.com.br</p>
      </div>
    </div>
  );
}

export default LoginPage;
