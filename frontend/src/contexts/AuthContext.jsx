/**
 * Contexto de Autenticação
 * Gerencia token JWT, dados do usuário e estado de login
 * - sessionStorage (padrão): token expira ao fechar aba/navegador
 * - localStorage (Lembrar-me): token persiste entre sessões
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

// Helpers para gerenciar storage (sessionStorage ou localStorage)
const getToken = () => {
  return sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token');
};

const setToken = (token, lembrar = false) => {
  if (lembrar) {
    localStorage.setItem('auth_token', token);
    sessionStorage.removeItem('auth_token');
  } else {
    sessionStorage.setItem('auth_token', token);
    localStorage.removeItem('auth_token');
  }
};

const removeToken = () => {
  localStorage.removeItem('auth_token');
  sessionStorage.removeItem('auth_token');
};

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [senhaTemporaria, setSenhaTemporaria] = useState(false);
  const [carregando, setCarregando] = useState(true);

  // Estado da seleção obrigatória de cliente após o login (admin / multi-restaurante).
  // Persiste em sessionStorage para sobreviver a um refresh entre login e seleção.
  const [restaurantesDisponiveis, setRestaurantesDisponiveis] = useState([]);
  const [precisaEscolherCliente, setPrecisaEscolherCliente] = useState(
    () => sessionStorage.getItem('precisa_escolher_cliente') === '1'
  );

  const ativarEscolhaCliente = useCallback((restaurantes = []) => {
    setRestaurantesDisponiveis(restaurantes);
    setPrecisaEscolherCliente(true);
    sessionStorage.setItem('precisa_escolher_cliente', '1');
  }, []);

  const desativarEscolhaCliente = useCallback(() => {
    setRestaurantesDisponiveis([]);
    setPrecisaEscolherCliente(false);
    sessionStorage.removeItem('precisa_escolher_cliente');
  }, []);

  // Verifica token salvo ao montar (com cleanup para evitar memory leak)
  useEffect(() => {
    let cancelado = false;
    const token = getToken();

    if (token) {
      // Decodificar JWT para verificar flag de senha temporária
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.senha_temporaria) {
          if (!cancelado) setSenhaTemporaria(true);
        }
      } catch { /* ignore */ }

      api.get('/auth/me')
        .then(res => {
          if (!cancelado) setUsuario(res.data.data.usuario);
        })
        .catch(() => {
          if (!cancelado) {
            removeToken();
            setUsuario(null);
            setSenhaTemporaria(false);
            sessionStorage.removeItem('precisa_escolher_cliente');
            setPrecisaEscolherCliente(false);
          }
        })
        .finally(() => {
          if (!cancelado) setCarregando(false);
        });
    } else {
      setCarregando(false);
    }

    return () => { cancelado = true; };
  }, []);

  /**
   * Etapa 1 do login — valida credenciais. Retorna dados do challenge 2FA.
   */
  const iniciarLogin = useCallback(async (loginStr, senha) => {
    const res = await api.post('/auth/login', { login: loginStr, senha });
    return res.data.data; // { challenge_token, awaiting_2fa, contato }
  }, []);

  /**
   * Etapa 2 — solicita envio do código de 6 dígitos via sms ou email.
   */
  const enviar2FA = useCallback(async (challengeToken, metodo) => {
    const res = await api.post('/auth/2fa/enviar', { challenge_token: challengeToken, metodo });
    return res.data.data; // { challenge_token, metodo }
  }, []);

  // Auth pendente — segura token+usuário entre verificar2FA e o aceite dos termos.
  // A escolha de restaurante deixou de bloquear o login: agora ela é exigida via
  // modal bloqueante dentro do Layout (precisaEscolherCliente).
  const [authPendente, setAuthPendente] = useState(null);

  /**
   * Etapa 3 — valida o código. Se exige aceite de termos, segura em authPendente
   * (LoginPage trata a etapa). Se exige escolher cliente, login é efetivado
   * normalmente e levanta a flag `precisaEscolherCliente` para o Layout exibir o
   * modal bloqueante.
   */
  const verificar2FA = useCallback(async (challengeToken, codigo, lembrar = false) => {
    const res = await api.post('/auth/2fa/verificar', { challenge_token: challengeToken, codigo });
    const { token, senha_temporaria: senhaTemp, terms_accepted: termsAccepted, usuario: usr, restaurantes } = res.data.data;
    const precisaTermos = !senhaTemp && !termsAccepted;
    const ehAdmin = usr?.usr_administrador === 'S';
    const multiRestaurante = (usr?.total_restaurantes || 1) > 1;
    const precisaEscolher = !senhaTemp && termsAccepted && (ehAdmin || multiRestaurante);

    if (precisaTermos) {
      setAuthPendente({ token, usuario: usr, lembrar, restaurantes: restaurantes || [], termsAccepted: !!termsAccepted });
      return {
        usuario: usr,
        senhaTemporaria: false,
        precisaAceitarTermos: true,
        precisaEscolherRestaurante: false,
        restaurantes: restaurantes || []
      };
    }

    setToken(token, lembrar);
    setUsuario(usr);
    setSenhaTemporaria(!!senhaTemp);
    if (precisaEscolher) {
      ativarEscolhaCliente(restaurantes || []);
    } else {
      desativarEscolhaCliente();
    }
    return { usuario: usr, senhaTemporaria: !!senhaTemp, precisaEscolherRestaurante: precisaEscolher };
  }, [ativarEscolhaCliente, desativarEscolhaCliente]);

  /**
   * Registra o aceite dos termos no backend usando o token pendente, efetiva o
   * login e — se for admin ou multi-restaurante — levanta a flag de seleção
   * obrigatória.
   */
  const aceitarTermos = useCallback(async () => {
    if (!authPendente) throw new Error('Não há login pendente');
    const { token, lembrar, usuario: usr, restaurantes } = authPendente;
    setToken(token, lembrar);
    try {
      await api.post('/auth/aceitar-termos');
      const ehAdmin = usr?.usr_administrador === 'S';
      const multiRestaurante = (usr?.total_restaurantes || 1) > 1;
      const precisaEscolher = ehAdmin || multiRestaurante;

      setUsuario(usr);
      setSenhaTemporaria(false);
      setAuthPendente(null);
      if (precisaEscolher) ativarEscolhaCliente(restaurantes || []);
      else desativarEscolhaCliente();

      return { precisaEscolherRestaurante: precisaEscolher };
    } catch (err) {
      removeToken();
      throw err;
    }
  }, [authPendente, ativarEscolhaCliente, desativarEscolhaCliente]);

  /**
   * Conclui a seleção obrigatória do cliente após login. Se o id escolhido é o
   * mesmo já carregado no usuário, apenas baixa a flag. Caso contrário, troca
   * via /auth/trocar-cliente e atualiza token/usuário.
   */
  const confirmarClienteSelecionado = useCallback(async (clienteId) => {
    if (!usuario) throw new Error('Sem usuário autenticado');
    if (clienteId === usuario.crd_cli_id) {
      desativarEscolhaCliente();
      return usuario;
    }
    const res = await api.post('/auth/trocar-cliente', { cliente_id: clienteId });
    const { token: novoToken, usuario: novoUsuario } = res.data.data;
    const lembrar = !!localStorage.getItem('auth_token');
    setToken(novoToken, lembrar);
    setUsuario(novoUsuario);
    desativarEscolhaCliente();
    return novoUsuario;
  }, [usuario, desativarEscolhaCliente]);

  const cancelarAuthPendente = useCallback(() => {
    setAuthPendente(null);
  }, []);

  const atualizarToken = useCallback((novoToken) => {
    const lembrar = !!localStorage.getItem('auth_token');
    setToken(novoToken, lembrar);
    setSenhaTemporaria(false);
  }, []);

  /**
   * Troca o cliente ativo (apenas admins).
   * Chama /auth/trocar-cliente no back, salva o novo token e atualiza usuário.
   */
  const trocarCliente = useCallback(async (clienteId) => {
    const res = await api.post('/auth/trocar-cliente', { cliente_id: clienteId });
    const { token: novoToken, usuario: novoUsuario } = res.data.data;
    const lembrar = !!localStorage.getItem('auth_token');
    setToken(novoToken, lembrar);
    setUsuario(novoUsuario);
    return novoUsuario;
  }, []);

  const logout = useCallback(() => {
    removeToken();
    setUsuario(null);
    setSenhaTemporaria(false);
    desativarEscolhaCliente();
  }, [desativarEscolhaCliente]);

  // Escutar evento de logout disparado pelo interceptor da API (evita hard reload)
  useEffect(() => {
    const handleLogoutEvento = () => logout();
    window.addEventListener('auth:logout', handleLogoutEvento);
    return () => window.removeEventListener('auth:logout', handleLogoutEvento);
  }, [logout]);

  // Memoizar o value para evitar re-renders desnecessários
  const value = useMemo(() => ({
    usuario, carregando,
    iniciarLogin, enviar2FA, verificar2FA,
    aceitarTermos, confirmarClienteSelecionado, cancelarAuthPendente, authPendente,
    logout, atualizarToken, trocarCliente,
    autenticado: !!usuario, senhaTemporaria,
    precisaEscolherCliente, restaurantesDisponiveis
  }), [usuario, carregando, iniciarLogin, enviar2FA, verificar2FA, aceitarTermos, confirmarClienteSelecionado, cancelarAuthPendente, authPendente, logout, atualizarToken, trocarCliente, senhaTemporaria, precisaEscolherCliente, restaurantesDisponiveis]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
