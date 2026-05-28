/**
 * FormColaborador
 * Formulário de cadastro/edição de colaborador
 * Visual alinhado com DetalheRecarga/ListaRecargas
 */

import React, { useState, useEffect, useCallback } from 'react';
import { gestaoColaboradoresAPI } from '../services/api';

const FormColaborador = ({ clienteId, colaboradorId, login, onVoltar }) => {
  const isNovo = !colaboradorId;

  const [editando, setEditando] = useState(isNovo);
  const [loading, setLoading] = useState(!isNovo);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const [sucesso, setSucesso] = useState(null);

  const [form, setForm] = useState({
    nome: '', cpf: '', email: '', celular: '',
    nascimento: '', sexo: '',
    cliente_id: clienteId
  });
  const [dadosOriginais, setDadosOriginais] = useState(null);
  const [restaurantes, setRestaurantes] = useState([]);
  const [setores, setSetores] = useState([]); // todas as categorias disponíveis
  const [categoriasSelecionadas, setCategoriasSelecionadas] = useState([]); // categorias do usuário
  const [categoriasOriginais, setCategoriasOriginais] = useState([]);
  const [novaCategoria, setNovaCategoria] = useState('');
  const [criandoCategoria, setCriandoCategoria] = useState(false);
  const [situacao, setSituacao] = useState({ id: 1, nome: 'ATIVO' });
  const [dataCadastro, setDataCadastro] = useState('');

  useEffect(() => {
    const carregarAuxiliares = async () => {
      try {
        const [restRes, setRes] = await Promise.all([
          gestaoColaboradoresAPI.obterRestaurantes(clienteId),
          gestaoColaboradoresAPI.obterSetores(clienteId)
        ]);
        setRestaurantes(restRes.data?.data || []);
        setSetores(setRes.data?.data || []);
      } catch (err) {
        console.error('Erro ao carregar dados auxiliares:', err);
      }
    };
    carregarAuxiliares();
  }, [clienteId]);

  const formatarDataParaInput = (data) => {
    if (!data) return '';
    const d = new Date(data);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  };

  const formatarDataExibicao = (data) => {
    if (!data) return '';
    const d = new Date(data);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR');
  };

  const carregarColaborador = useCallback(async () => {
    if (isNovo) return;
    setLoading(true);
    setErro(null);
    try {
      const response = await gestaoColaboradoresAPI.obterColaborador(clienteId, colaboradorId);
      const dados = response.data?.data;
      if (!dados) { setErro('Colaborador não encontrado'); return; }

      // Aplicar máscara no CPF vindo do banco (gravado sem máscara)
      const cpfExibicao = (() => {
        const limpo = (dados.cpf || '').replace(/\D/g, '');
        if (limpo.length === 11) {
          return `${limpo.slice(0, 3)}.${limpo.slice(3, 6)}.${limpo.slice(6, 9)}-${limpo.slice(9)}`;
        }
        return dados.cpf || '';
      })();

      const formData = {
        nome: dados.nome || '', cpf: cpfExibicao,
        email: dados.email || '', celular: dados.celular || '',
        nascimento: dados.nascimento ? formatarDataParaInput(dados.nascimento) : '',
        sexo: dados.sexo || '',
        cliente_id: dados.cliente_id || clienteId
      };
      setForm(formData);
      setDadosOriginais(formData);
      // Carregar categorias do usuário via junction table
      const cats = (dados.categorias || []).map(c => ({ id: c.id, nome: c.nome }));
      setCategoriasSelecionadas(cats);
      setCategoriasOriginais(cats);
      setSituacao({
        id: dados.situacao_id,
        nome: dados.situacao_id === 1 ? 'ATIVO' : 'INATIVO'
      });
      setDataCadastro(formatarDataExibicao(dados.data_cadastro));
    } catch (err) {
      setErro(err.response?.data?.message || 'Erro ao carregar colaborador');
    } finally {
      setLoading(false);
    }
  }, [clienteId, colaboradorId, isNovo]);

  useEffect(() => { carregarColaborador(); }, [carregarColaborador]);

  // Masks
  const formatarCPF = (valor) => {
    const l = valor.replace(/\D/g, '').slice(0, 11);
    if (l.length <= 3) return l;
    if (l.length <= 6) return `${l.slice(0, 3)}.${l.slice(3)}`;
    if (l.length <= 9) return `${l.slice(0, 3)}.${l.slice(3, 6)}.${l.slice(6)}`;
    return `${l.slice(0, 3)}.${l.slice(3, 6)}.${l.slice(6, 9)}-${l.slice(9)}`;
  };

  const formatarCelular = (valor) => {
    const l = valor.replace(/\D/g, '').slice(0, 11);
    if (l.length <= 2) return l.length ? `(${l}` : '';
    if (l.length <= 7) return `(${l.slice(0, 2)}) ${l.slice(2)}`;
    return `(${l.slice(0, 2)}) ${l.slice(2, 7)}-${l.slice(7)}`;
  };

  const handleChange = (campo, valor) => {
    let v = valor;
    if (campo === 'cpf') v = formatarCPF(valor);
    if (campo === 'celular') v = formatarCelular(valor);
    if (campo === 'nome') v = valor.toUpperCase();
    if (campo === 'email') v = valor.toUpperCase();
    setForm(prev => ({ ...prev, [campo]: v }));
    setSucesso(null);
  };

  // Validação de CPF com dígitos verificadores
  const validarCPF = (cpf) => {
    const limpo = cpf.replace(/\D/g, '');
    if (limpo.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(limpo)) return false;
    let soma = 0;
    for (let i = 0; i < 9; i++) soma += parseInt(limpo[i]) * (10 - i);
    let resto = (soma * 10) % 11;
    if (resto === 10) resto = 0;
    if (resto !== parseInt(limpo[9])) return false;
    soma = 0;
    for (let i = 0; i < 10; i++) soma += parseInt(limpo[i]) * (11 - i);
    resto = (soma * 10) % 11;
    if (resto === 10) resto = 0;
    if (resto !== parseInt(limpo[10])) return false;
    return true;
  };

  const validarEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const validarFormulario = () => {
    if (!form.nome.trim()) return 'Nome é obrigatório';
    if (!form.cpf.trim()) return 'CPF é obrigatório';
    if (!validarCPF(form.cpf)) return 'CPF inválido (verifique os dígitos)';
    if (form.email.trim() && !validarEmail(form.email.trim())) return 'Email inválido';
    if (form.nascimento) {
      const dataNasc = new Date(form.nascimento);
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      if (isNaN(dataNasc.getTime()) || dataNasc >= hoje) return 'Data de nascimento deve ser anterior a hoje';
    }
    return null;
  };

  const handleSalvar = async () => {
    setSalvando(true); setErro(null); setSucesso(null);

    // Validações no frontend
    const erroValidacao = validarFormulario();
    if (erroValidacao) {
      setErro(erroValidacao);
      setSalvando(false);
      return;
    }

    // CPF sem máscara para o backend
    const dadosEnvio = {
      ...form,
      cpf: form.cpf.replace(/\D/g, ''),
      celular: form.celular ? form.celular.replace(/\D/g, '') : '',
      email: form.email.trim().toLowerCase()
    };

    const catIds = categoriasSelecionadas.map(c => c.id);
    try {
      if (isNovo) {
        await gestaoColaboradoresAPI.criar({
          ...dadosEnvio, cliente_id: parseInt(form.cliente_id),
          categorias: catIds
        });
        setSucesso('Colaborador criado com sucesso!');
        setTimeout(() => onVoltar(), 1000);
      } else {
        await gestaoColaboradoresAPI.atualizar(clienteId, colaboradorId, {
          ...dadosEnvio, categorias: catIds
        });
        setSucesso('Colaborador atualizado com sucesso!');
        setEditando(false);
        setDadosOriginais({ ...form });
        setCategoriasOriginais([...categoriasSelecionadas]);
      }
    } catch (err) {
      setErro(err.response?.data?.message || 'Erro ao salvar colaborador');
    } finally {
      setSalvando(false);
    }
  };

  const handleCancelar = () => {
    if (isNovo) { onVoltar(); return; }
    setForm({ ...dadosOriginais });
    setCategoriasSelecionadas([...categoriasOriginais]);
    setEditando(false); setErro(null); setSucesso(null);
  };

  // === Funções de Tags/Categorias ===
  const handleAdicionarCategoria = (setorId) => {
    const setor = setores.find(s => s.id === parseInt(setorId));
    if (!setor) return;
    if (categoriasSelecionadas.find(c => c.id === setor.id)) return; // já existe
    setCategoriasSelecionadas(prev => [...prev, { id: setor.id, nome: setor.nome }]);
  };

  const handleRemoverCategoria = (catId) => {
    setCategoriasSelecionadas(prev => prev.filter(c => c.id !== catId));
  };

  const handleCriarCategoria = async () => {
    if (!novaCategoria.trim()) return;
    setCriandoCategoria(true);
    try {
      const response = await gestaoColaboradoresAPI.criarCategoria(clienteId, novaCategoria.trim());
      const nova = response.data?.data;
      if (nova) {
        setSetores(prev => [...prev, nova].sort((a, b) => a.nome.localeCompare(b.nome)));
        setCategoriasSelecionadas(prev => [...prev, { id: nova.id, nome: nova.nome }]);
      }
      setNovaCategoria('');
    } catch (err) {
      setErro(err.response?.data?.message || 'Erro ao criar categoria');
    } finally {
      setCriandoCategoria(false);
    }
  };

  const handleAlterarSituacao = async () => {
    const nova = situacao.id === 1 ? 2 : 1;
    try {
      await gestaoColaboradoresAPI.alterarSituacao(clienteId, colaboradorId, nova);
      setSituacao({ id: nova, nome: nova === 1 ? 'ATIVO' : 'INATIVO' });
      setSucesso(nova === 1 ? 'Colaborador ativado!' : 'Colaborador inativado!');
    } catch (err) {
      setErro(err.response?.data?.message || 'Erro ao alterar situação');
    }
  };

  // Loading
  if (loading) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--cinza-500)' }}>
        <div style={{
          width: '40px', height: '40px', margin: '0 auto 16px',
          border: '3px solid var(--cinza-300)', borderTopColor: 'var(--roxo)',
          borderRadius: '50%', animation: 'spin 0.8s linear infinite'
        }} />
        Carregando dados do colaborador...
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="form-colaborador">
      <button className="btn-voltar" onClick={onVoltar}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Voltar
      </button>

      <div className="page-header">
        <div className="page-header-info">
          <h2 className="page-title">
            {isNovo ? 'Novo Colaborador' : 'Edição de Colaborador'}
          </h2>
          {!isNovo && (
            <span className={`badge ${situacao.id === 1 ? 'badge-ativo' : 'badge-inativo'}`}>
              {situacao.nome?.toUpperCase()}
            </span>
          )}
          {isNovo && <span className="badge badge-roxo">INCLUSÃO</span>}
          {!isNovo && (
            <span style={{ fontSize: '0.78rem', color: 'var(--cinza-500)' }}>ID: {colaboradorId}</span>
          )}
        </div>

        <div className="page-header-actions">
          {editando ? (
            <>
              <button className="btn-selecionar" onClick={handleSalvar} disabled={salvando}
                style={{ padding: '7px 16px', fontSize: '0.8rem', borderRadius: '6px' }}>
                {salvando ? 'Salvando...' : '💾 Salvar'}
              </button>
              <button className="btn-secundario" onClick={handleCancelar}
                style={{ padding: '7px 16px', fontSize: '0.8rem', borderRadius: '6px' }}>
                ✖ Cancelar
              </button>
            </>
          ) : (
            <>
              <button className="btn-primario" onClick={() => setEditando(true)}
                style={{ padding: '7px 16px', fontSize: '0.8rem', borderRadius: '6px' }}>
                ✏️ Editar
              </button>
              <button className="btn-secundario" onClick={carregarColaborador}
                style={{ padding: '7px 16px', fontSize: '0.8rem', borderRadius: '6px' }}>
                🔄 Atualizar
              </button>
            </>
          )}
        </div>
      </div>

      {/* Alertas */}
      {erro && <div className="alert alert-erro" style={{ marginBottom: '10px', padding: '8px 12px', fontSize: '0.82rem' }}>{erro}</div>}
      {sucesso && <div className="alert alert-sucesso" style={{ marginBottom: '10px', padding: '8px 12px', fontSize: '0.82rem' }}>{sucesso}</div>}

      <div>
          {/* Informações Pessoais */}
          <div className="section-card">
            <h4 className="section-title">Informações Pessoais</h4>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              <div className="grupo-form" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '0.75rem', marginBottom: '3px' }}>Nome Completo <span style={{ color: '#dc2626' }}>*</span></label>
                <input type="text" value={form.nome} onChange={(e) => handleChange('nome', e.target.value)}
                  disabled={!editando} placeholder="Nome completo" style={{ padding: '6px 8px', fontSize: '0.82rem' }} />
              </div>
              <div className="grupo-form" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '0.75rem', marginBottom: '3px' }}>CPF <span style={{ color: '#dc2626' }}>*</span></label>
                <input type="text" value={form.cpf} onChange={(e) => handleChange('cpf', e.target.value)}
                  disabled={!editando} placeholder="000.000.000-00" maxLength={14} style={{ padding: '6px 8px', fontSize: '0.82rem' }} />
              </div>
              <div className="grupo-form" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '0.75rem', marginBottom: '3px' }}>Email <span style={{ color: '#dc2626' }}>*</span></label>
                <input type="email" value={form.email} onChange={(e) => handleChange('email', e.target.value)}
                  disabled={!editando} placeholder="email@exemplo.com" style={{ padding: '6px 8px', fontSize: '0.82rem' }} />
              </div>
              <div className="grupo-form" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '0.75rem', marginBottom: '3px' }}>Celular <span style={{ color: '#dc2626' }}>*</span></label>
                <input type="text" value={form.celular} onChange={(e) => handleChange('celular', e.target.value)}
                  disabled={!editando} placeholder="(00) 00000-0000" maxLength={15} style={{ padding: '6px 8px', fontSize: '0.82rem' }} />
              </div>
              <div className="grupo-form" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '0.75rem', marginBottom: '3px' }}>Data Nascimento <span style={{ color: '#dc2626' }}>*</span></label>
                <input type="date" value={form.nascimento} onChange={(e) => handleChange('nascimento', e.target.value)}
                  disabled={!editando} style={{ padding: '6px 8px', fontSize: '0.82rem' }} />
              </div>
              <div className="grupo-form" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '0.75rem', marginBottom: '3px' }}>Sexo <span style={{ color: '#dc2626' }}>*</span></label>
                <select value={form.sexo} onChange={(e) => handleChange('sexo', e.target.value)} disabled={!editando}
                  style={{ padding: '6px 8px', fontSize: '0.82rem' }}>
                  <option value="">Selecione</option>
                  <option value="M">Masculino</option>
                  <option value="F">Feminino</option>
                </select>
              </div>
            </div>
          </div>

          {/* Categorias + Situação + Restaurante/Data — tudo em uma linha */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            {/* Categorias (Etiquetas) */}
            <div className="section-card" style={{ marginBottom: 0 }}>
              <h4 className="section-title">Categorias</h4>

              {/* Tags selecionadas */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: categoriasSelecionadas.length > 0 ? '8px' : '0' }}>
                {categoriasSelecionadas.map(cat => (
                  <span key={cat.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    background: '#f3e8ff', color: 'var(--roxo)',
                    padding: '3px 9px', borderRadius: '999px',
                    fontSize: '0.72rem', fontWeight: 600
                  }}>
                    {cat.nome}
                    {editando && (
                      <button onClick={() => handleRemoverCategoria(cat.id)} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--roxo)', fontSize: '0.85rem', lineHeight: 1,
                        padding: '0 0 0 2px', opacity: 0.7
                      }} title="Remover">&times;</button>
                    )}
                  </span>
                ))}
              </div>

              {editando && (
                <>
                  <div className="grupo-form" style={{ marginBottom: '6px' }}>
                    <select
                      value=""
                      onChange={(e) => { if (e.target.value) handleAdicionarCategoria(e.target.value); }}
                      style={{ fontSize: '0.78rem', padding: '5px 8px' }}
                    >
                      <option value="">+ Adicionar...</option>
                      {setores
                        .filter(s => !categoriasSelecionadas.find(c => c.id === s.id))
                        .map(s => <option key={s.id} value={s.id}>{s.nome}</option>)
                      }
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={novaCategoria}
                      onChange={(e) => setNovaCategoria(e.target.value.toUpperCase())}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCriarCategoria(); } }}
                      placeholder="Nova..."
                      style={{
                        flex: 1, padding: '5px 8px', border: '1px solid var(--cinza-300)',
                        borderRadius: '5px', fontSize: '0.78rem'
                      }}
                    />
                    <button
                      onClick={handleCriarCategoria}
                      disabled={criandoCategoria || !novaCategoria.trim()}
                      style={{
                        background: 'var(--roxo)', color: '#fff', border: 'none',
                        borderRadius: '5px', padding: '5px 10px', fontSize: '0.72rem',
                        fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                        opacity: criandoCategoria || !novaCategoria.trim() ? 0.5 : 1
                      }}
                    >
                      {criandoCategoria ? '...' : '+ Criar'}
                    </button>
                  </div>
                </>
              )}

              {!editando && categoriasSelecionadas.length === 0 && (
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--cinza-500)' }}>
                  Nenhuma categoria
                </p>
              )}
            </div>

            {/* Situação */}
            <div className="section-card" style={{ marginBottom: 0 }}>
              <h4 className="section-title">Situação</h4>

              {!isNovo ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ marginBottom: '10px' }}>
                    {situacao.id === 1 ? (
                      <span className="badge badge-ativo">ATIVO</span>
                    ) : (
                      <span className="badge badge-inativo">INATIVO</span>
                    )}
                  </div>
                  <button
                    onClick={handleAlterarSituacao}
                    style={{
                      width: '100%', padding: '7px', borderRadius: '6px',
                      border: 'none', cursor: 'pointer', fontWeight: 600,
                      fontSize: '0.8rem', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: '6px',
                      background: situacao.id === 1 ? '#dc2626' : 'var(--roxo)',
                      color: '#fff'
                    }}
                  >
                    {situacao.id === 1 ? 'Inativar' : 'Ativar'}
                  </button>
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--cinza-600)', fontSize: '0.8rem', padding: '4px 0' }}>
                  Será criado como <strong style={{ color: '#065f46' }}>ATIVO</strong>
                </div>
              )}
            </div>

            {/* Restaurante + Data Cadastro */}
            <div className="section-card" style={{ marginBottom: 0 }}>
              <h4 className="section-title">Vínculo</h4>
              <div className="grupo-form" style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '0.75rem', marginBottom: '3px' }}>Restaurante <span style={{ color: '#dc2626' }}>*</span></label>
                <select value={form.cliente_id} onChange={(e) => handleChange('cliente_id', e.target.value)} disabled={!editando}
                  style={{ padding: '5px 8px', fontSize: '0.82rem' }}>
                  {restaurantes.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
                </select>
              </div>
              <div className="grupo-form" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '0.75rem', marginBottom: '3px' }}>Data Cadastro</label>
                <input type="text" value={isNovo ? new Date().toLocaleDateString('pt-BR') : dataCadastro}
                  disabled style={{ background: 'var(--cinza-100)', padding: '5px 8px', fontSize: '0.82rem' }} />
              </div>
            </div>
          </div>
        </div>
    </div>
  );
};

export default FormColaborador;
