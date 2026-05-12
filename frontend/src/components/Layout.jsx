/**
 * Layout Principal
 * Sidebar + Header + Conteúdo
 * Design BR Gorjeta
 */

import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';
import { formatCNPJ, getIniciais } from '../utils/formatters';
import './Layout.css';

// Ícones SVG limpos
const IconDashboard = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

const IconColaboradores = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 00-3-3.87" />
    <path d="M16 3.13a4 4 0 010 7.75" />
  </svg>
);

const IconCredito = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
  </svg>
);

const IconRelatorios = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const IconClientes = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-5h-2v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);

function Layout() {
  const {
    usuario, logout, trocarCliente,
    precisaEscolherCliente, restaurantesDisponiveis, confirmarClienteSelecionado
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showDropdown, setShowDropdown] = useState(false);
  const [sidebarAberta, setSidebarAberta] = useState(false);
  const dropdownRef = useRef(null);

  // Modal de seleção de cliente — admin OU usuário com >1 restaurante vinculado
  const isAdmin = usuario?.usr_administrador === 'S';
  const temMultiplosRestaurantes = (usuario?.total_restaurantes || 1) > 1;
  const podeTrocarRestaurante = isAdmin || temMultiplosRestaurantes;
  const [modalClienteAberto, setModalClienteAberto] = useState(false);
  const [clientes, setClientes] = useState([]);
  const [carregandoClientes, setCarregandoClientes] = useState(false);
  const [buscaCliente, setBuscaCliente] = useState('');
  const [erroCliente, setErroCliente] = useState('');
  const [trocandoCliente, setTrocandoCliente] = useState(false);

  // Estado do modal bloqueante (logo após o login)
  const [buscaInicial, setBuscaInicial] = useState('');
  const [erroInicial, setErroInicial] = useState('');
  const [confirmandoInicial, setConfirmandoInicial] = useState(false);
  const [clientesInicial, setClientesInicial] = useState([]);
  const [carregandoInicial, setCarregandoInicial] = useState(false);

  // Carrega lista para o modal bloqueante: usa a já vinda no login; cai pro
  // /auth/clientes só se o usuário tiver dado refresh entre login e seleção.
  useEffect(() => {
    if (!precisaEscolherCliente) return;
    if (restaurantesDisponiveis && restaurantesDisponiveis.length > 0) {
      setClientesInicial(restaurantesDisponiveis);
      return;
    }
    let cancelado = false;
    setCarregandoInicial(true);
    setErroInicial('');
    authAPI.listarClientes()
      .then(res => { if (!cancelado) setClientesInicial(res.data?.data || []); })
      .catch(err => {
        if (!cancelado) setErroInicial(err.response?.data?.message || 'Erro ao carregar restaurantes');
      })
      .finally(() => { if (!cancelado) setCarregandoInicial(false); });
    return () => { cancelado = true; };
  }, [precisaEscolherCliente, restaurantesDisponiveis]);

  const clientesInicialFiltrados = clientesInicial.filter(c => {
    if (!buscaInicial.trim()) return true;
    const termo = buscaInicial.toLowerCase();
    const termoDigitos = termo.replace(/\D/g, '');
    const nome = (c.crd_cli_nome_fantasia || '').toLowerCase();
    const cnpj = (c.crd_cli_cnpj || '').replace(/\D/g, '');
    return nome.includes(termo) || (termoDigitos.length > 0 && cnpj.includes(termoDigitos));
  });

  const confirmarSelecaoInicial = async (clienteId) => {
    if (confirmandoInicial) return;
    setConfirmandoInicial(true);
    setErroInicial('');
    try {
      await confirmarClienteSelecionado(clienteId);
      navigate('/dashboard');
    } catch (err) {
      setErroInicial(err.response?.data?.message || 'Erro ao selecionar restaurante');
    } finally {
      setConfirmandoInicial(false);
    }
  };

  const sairDoModalBloqueante = () => {
    if (confirmandoInicial) return;
    logout();
    navigate('/login');
  };

  const pageTitles = {
    '/dashboard': 'Dashboard Empresa',
    '/colaboradores': 'Gestão de Colaboradores',
    '/credito': 'Gerar Recarga',
    '/relatorios': 'Relatórios',
    '/alterar-senha': 'Alterar Senha'
  };
  const pageTitle = pageTitles[location.pathname] || 'BR Gorjeta';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const iniciais = getIniciais(usuario?.usr_nome);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickFora = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickFora);
    return () => document.removeEventListener('mousedown', handleClickFora);
  }, []);

  // Fechar sidebar mobile ao navegar
  useEffect(() => {
    setSidebarAberta(false);
  }, [location.pathname]);

  const abrirModalClientes = async () => {
    setSidebarAberta(false);
    setModalClienteAberto(true);
    setBuscaCliente('');
    setErroCliente('');
    if (clientes.length === 0) {
      setCarregandoClientes(true);
      try {
        const res = await authAPI.listarClientes();
        setClientes(res.data?.data || []);
      } catch (err) {
        setErroCliente(err.response?.data?.message || 'Erro ao carregar clientes');
      } finally {
        setCarregandoClientes(false);
      }
    }
  };

  const selecionarCliente = async (clienteId) => {
    if (trocandoCliente) return;
    if (clienteId === usuario?.crd_cli_id) {
      setModalClienteAberto(false);
      return;
    }
    setTrocandoCliente(true);
    setErroCliente('');
    try {
      await trocarCliente(clienteId);
      setModalClienteAberto(false);
      // Navegar para o dashboard para recarregar dados no contexto do novo cliente
      navigate('/dashboard');
    } catch (err) {
      setErroCliente(err.response?.data?.message || 'Erro ao trocar de cliente');
    } finally {
      setTrocandoCliente(false);
    }
  };

  const clientesFiltrados = clientes.filter(c => {
    if (!buscaCliente.trim()) return true;
    const termo = buscaCliente.toLowerCase();
    const termoDigitos = termo.replace(/\D/g, '');
    const nome = (c.crd_cli_nome_fantasia || '').toLowerCase();
    const cnpj = (c.crd_cli_cnpj || '').replace(/\D/g, '');
    return nome.includes(termo) || (termoDigitos.length > 0 && cnpj.includes(termoDigitos));
  });

  return (
    <div className="layout">
      {/* Overlay mobile */}
      {sidebarAberta && (
        <div className="sidebar-overlay" onClick={() => setSidebarAberta(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarAberta ? 'sidebar-aberta' : ''}`}>
        <div className="sidebar-logo">
          <img src="/images/logo-rosa-branca.png" alt="BR Gorjeta" />
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/dashboard" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
            <IconDashboard /> Dashboard
          </NavLink>
          <NavLink to="/colaboradores" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
            <IconColaboradores /> Colaboradores
          </NavLink>
          <NavLink to="/credito" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
            <IconCredito /> Gerar Recarga
          </NavLink>
          <NavLink to="/relatorios" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
            <IconRelatorios /> Relatórios
          </NavLink>

          {podeTrocarRestaurante && (
            <button
              type="button"
              className="sidebar-item"
              onClick={abrirModalClientes}
            >
              <IconClientes /> {isAdmin ? 'Selecionar Cliente' : 'Trocar Restaurante'}
            </button>
          )}
        </nav>
      </aside>

      {/* Modal de seleção de cliente (admin) */}
      {modalClienteAberto && (
        <div className="cliente-modal-overlay" onClick={() => !trocandoCliente && setModalClienteAberto(false)}>
          <div className="cliente-modal" onClick={e => e.stopPropagation()}>
            <div className="cliente-modal-header">
              <h3>Selecionar Cliente</h3>
              <button
                className="cliente-modal-close"
                onClick={() => !trocandoCliente && setModalClienteAberto(false)}
                disabled={trocandoCliente}
                aria-label="Fechar"
              >&times;</button>
            </div>

            <div className="cliente-modal-body">
              <input
                type="text"
                className="cliente-modal-search"
                placeholder="Buscar por nome ou CNPJ..."
                value={buscaCliente}
                onChange={e => setBuscaCliente(e.target.value)}
                autoFocus
              />

              {erroCliente && (
                <div className="cliente-modal-erro">{erroCliente}</div>
              )}

              {carregandoClientes ? (
                <div className="cliente-modal-loading">Carregando clientes...</div>
              ) : (
                <ul className="cliente-modal-lista">
                  {clientesFiltrados.length === 0 && (
                    <li className="cliente-modal-vazio">Nenhum cliente encontrado</li>
                  )}
                  {clientesFiltrados.map(c => {
                    const ativo = c.crd_cli_id === usuario?.crd_cli_id;
                    return (
                      <li
                        key={c.crd_cli_id}
                        className={`cliente-modal-item ${ativo ? 'ativo' : ''}`}
                        onClick={() => selecionarCliente(c.crd_cli_id)}
                      >
                        <div className="cliente-modal-item-nome">{c.crd_cli_nome_fantasia}</div>
                        <div className="cliente-modal-item-cnpj">{formatCNPJ(c.crd_cli_cnpj)}</div>
                        {ativo && <span className="cliente-modal-item-check">&#10003;</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal bloqueante de seleção inicial — admin / multi-restaurante após o login.
          Sem botão fechar e sem fechar ao clicar fora: só sai escolhendo um restaurante
          ou via Sair (que faz logout). */}
      {precisaEscolherCliente && (
        <div className="cliente-modal-overlay">
          <div className="cliente-modal" onClick={e => e.stopPropagation()}>
            <div className="cliente-modal-header">
              <h3>{isAdmin ? 'Selecione o cliente para acessar' : 'Selecione o restaurante para acessar'}</h3>
            </div>

            <div className="cliente-modal-body">
              <p style={{ margin: '0 0 12px', color: 'var(--cinza-600)', fontSize: '0.85rem' }}>
                Sua conta tem acesso a múltiplos {isAdmin ? 'clientes' : 'restaurantes'}. Escolha em qual deseja navegar nesta sessão.
              </p>
              <input
                type="text"
                className="cliente-modal-search"
                placeholder="Buscar por nome ou CNPJ..."
                value={buscaInicial}
                onChange={e => setBuscaInicial(e.target.value)}
                autoFocus
                disabled={confirmandoInicial}
              />

              {erroInicial && (
                <div className="cliente-modal-erro">{erroInicial}</div>
              )}

              {carregandoInicial ? (
                <div className="cliente-modal-loading">Carregando...</div>
              ) : (
                <ul className="cliente-modal-lista">
                  {clientesInicialFiltrados.length === 0 && (
                    <li className="cliente-modal-vazio">Nenhum {isAdmin ? 'cliente' : 'restaurante'} encontrado</li>
                  )}
                  {clientesInicialFiltrados.map(c => (
                    <li
                      key={c.crd_cli_id}
                      className="cliente-modal-item"
                      onClick={() => confirmarSelecaoInicial(c.crd_cli_id)}
                      style={{ pointerEvents: confirmandoInicial ? 'none' : 'auto', opacity: confirmandoInicial ? 0.6 : 1 }}
                    >
                      <div className="cliente-modal-item-nome">{c.crd_cli_nome_fantasia || `Cliente #${c.crd_cli_id}`}</div>
                      <div className="cliente-modal-item-cnpj">{formatCNPJ(c.crd_cli_cnpj)}</div>
                    </li>
                  ))}
                </ul>
              )}

              <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={sairDoModalBloqueante}
                  disabled={confirmandoInicial}
                  style={{
                    padding: '8px 16px', fontSize: '0.85rem', fontWeight: 600,
                    color: '#dc2626', background: 'transparent', border: '1px solid #fecaca',
                    borderRadius: '8px', cursor: confirmandoInicial ? 'not-allowed' : 'pointer'
                  }}
                >
                  Sair
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conteúdo */}
      <div className="layout-content">
        {/* Header */}
        <header className="header">
          {/* Botão hamburger (mobile) */}
          <button className="header-menu-btn" onClick={() => setSidebarAberta(!sidebarAberta)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div className="header-title">{pageTitle}</div>

          <div className="header-right">
            <div className="header-user-info">
              <div className="header-user-name">{usuario?.cliente_nome || 'Restaurante'}</div>
              <div className="header-user-cnpj">{formatCNPJ(usuario?.cliente_cnpj)}</div>
            </div>

            <div
              className="header-avatar"
              ref={dropdownRef}
              onClick={() => setShowDropdown(!showDropdown)}
            >
              {iniciais}
              {showDropdown && (
                <div className="header-dropdown">
                  <div className="header-dropdown-item header-dropdown-nome">
                    {usuario?.usr_nome}
                  </div>
                  <button className="header-dropdown-item" onClick={() => { setShowDropdown(false); navigate('/alterar-senha'); }}>
                    Alterar Senha
                  </button>
                  <button className="header-dropdown-item danger" onClick={handleLogout}>
                    Sair
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Área principal — key força remount quando admin troca cliente,
            garantindo refetch dos dados da página atual */}
        <main className="main-content">
          <Outlet key={usuario?.crd_cli_id || 'sem-cliente'} />
        </main>
      </div>
    </div>
  );
}

export default Layout;
