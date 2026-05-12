/**
 * API Service
 * Configuração centralizada de chamadas HTTP
 */

import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3999/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
});

// Helper: busca token em sessionStorage ou localStorage
const getToken = () => {
  return sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token');
};

const removeToken = () => {
  localStorage.removeItem('auth_token');
  sessionStorage.removeItem('auth_token');
};

api.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      removeToken();
      // Disparar evento customizado em vez de hard reload
      window.dispatchEvent(new CustomEvent('auth:logout'));
    }
    return Promise.reject(error);
  }
);

/**
 * Auth API — endpoints auxiliares de autenticação
 */
export const authAPI = {
  /** Lista clientes disponíveis (apenas administradores) */
  listarClientes: () => api.get('/auth/clientes'),
  /** Troca o cliente ativo do admin; retorna novo token */
  trocarCliente: (clienteId) => api.post('/auth/trocar-cliente', { cliente_id: clienteId })
};

/**
 * Colaboradores API (para tela de Créditos)
 */
export const colaboradoresAPI = {
  listar: (clienteId, params = {}) => {
    return api.get('/colaboradores', { params: { cliente_id: clienteId, ...params } });
  },
  obterSetores: (clienteId) => {
    return api.get('/colaboradores/setores', { params: { cliente_id: clienteId } });
  },
  importarExcel: (clienteId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/colaboradores/import', formData, {
      params: { cliente_id: clienteId },
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  baixarPlanilha: (clienteId) => {
    return api.get('/colaboradores/planilha', {
      params: { cliente_id: clienteId },
      responseType: 'blob'
    });
  },
  obterTaxa: (clienteId) => {
    return api.get('/colaboradores/taxa', { params: { cliente_id: clienteId } });
  }
};

/**
 * Créditos API
 */
export const creditosAPI = {
  gerar: (clienteId, payload, login = 'sistema') => {
    return api.post('/creditos/gerar', payload, {
      params: { cliente_id: clienteId, login }
    });
  },
  obterHistorico: (clienteId, params = {}) => {
    return api.get('/creditos/historico', {
      params: { cliente_id: clienteId, ...params }
    });
  },
  obterDetalheRemessa: (clienteId, remessaId) => {
    return api.get(`/creditos/remessa/${remessaId}`, {
      params: { cliente_id: clienteId }
    });
  },
  cancelarRemessa: (clienteId, remessaId, login = 'sistema') => {
    return api.delete(`/creditos/remessa/${remessaId}`, {
      params: { cliente_id: clienteId, login }
    });
  },
  reemitirBoleto: (clienteId, remessaId) => {
    return api.post(`/creditos/remessa/${remessaId}/boleto`, null, {
      params: { cliente_id: clienteId }
    });
  },
  // Boleto PDF e QR Code via hub-bass — exigem JWT, então não dá pra usar
  // direto em <img src>/<a href>. Buscamos o blob autenticado e devolvemos
  // uma object URL pronta pra ser passada a esses atributos. O caller é
  // responsável por chamar URL.revokeObjectURL quando desmontar.
  fetchBoletoPdfBlobUrl: async (notaId) => {
    const res = await api.get(`/creditos/nota/${notaId}/pdf`, { responseType: 'blob' });
    return URL.createObjectURL(res.data);
  },
  fetchBoletoQrCodeBlobUrl: async (notaId) => {
    const res = await api.get(`/creditos/nota/${notaId}/qrcode`, { responseType: 'blob' });
    return URL.createObjectURL(res.data);
  }
};

/**
 * Gestão de Colaboradores API (para tela de Colaboradores CRUD)
 */
export const gestaoColaboradoresAPI = {
  /** Lista todos (ativos + inativos) */
  listarTodos: (clienteId, search = '') => {
    return api.get('/colaboradores/todos', {
      params: { cliente_id: clienteId, search, limit: 500 }
    });
  },

  /** Obtém dados completos de um colaborador */
  obterColaborador: (clienteId, userId) => {
    return api.get(`/colaboradores/${userId}`, {
      params: { cliente_id: clienteId }
    });
  },

  /** Cria novo colaborador */
  criar: (dados) => {
    return api.post('/colaboradores/criar', dados);
  },

  /** Atualiza colaborador existente */
  atualizar: (clienteId, userId, dados) => {
    return api.put(`/colaboradores/${userId}`, dados, {
      params: { cliente_id: clienteId }
    });
  },

  /** Altera situação (Ativar/Inativar) */
  alterarSituacao: (clienteId, userId, situacaoId) => {
    return api.patch(`/colaboradores/${userId}/situacao`, { situacao_id: situacaoId }, {
      params: { cliente_id: clienteId }
    });
  },

  /** Lista restaurantes filtrados por cliente */
  obterRestaurantes: (clienteId) => {
    return api.get('/colaboradores/restaurantes', { params: { cliente_id: clienteId } });
  },

  /** Busca setores/categorias de um cliente */
  obterSetores: (clienteId) => {
    return api.get('/colaboradores/setores', { params: { cliente_id: clienteId } });
  },

  /** Cria nova categoria */
  criarCategoria: (clienteId, nome) => {
    return api.post('/colaboradores/categorias', { nome }, { params: { cliente_id: clienteId } });
  },

  /** Deleta uma categoria */
  deletarCategoria: (clienteId, categoriaId) => {
    return api.delete(`/colaboradores/categorias/${categoriaId}`, { params: { cliente_id: clienteId } });
  },

  /** Baixa planilha padrão para importação de colaboradores */
  baixarPlanilhaUsuarios: (clienteId) => {
    return api.get('/colaboradores/planilha-usuarios', {
      params: { cliente_id: clienteId },
      responseType: 'blob'
    });
  },

  /** Importa colaboradores via Excel */
  importarUsuarios: (clienteId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/colaboradores/import-usuarios', formData, {
      params: { cliente_id: clienteId },
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }
};

/**
 * Relatórios API
 */
export const relatoriosAPI = {
  recargasPeriodo: (clienteId, dataInicio, dataFim) => {
    return api.get('/relatorios/recargas-periodo', {
      params: { cliente_id: clienteId, data_inicio: dataInicio, data_fim: dataFim }
    });
  },
  colaboradores: (clienteId) => {
    return api.get('/relatorios/colaboradores', {
      params: { cliente_id: clienteId }
    });
  },
  historicoColaborador: (clienteId, colaboradorId, dataInicio, dataFim) => {
    return api.get(`/relatorios/historico-colaborador/${colaboradorId}`, {
      params: { cliente_id: clienteId, data_inicio: dataInicio, data_fim: dataFim }
    });
  },
  listarColaboradores: (clienteId, search = '') => {
    return api.get('/relatorios/colaboradores-lista', {
      params: { cliente_id: clienteId, search }
    });
  }
};

export default api;
