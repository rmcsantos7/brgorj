/**
 * Componente: ListaRecargas
 * Tela inicial — lista de recargas/remessas com busca e detalhes
 */

import React, { useState, useEffect } from 'react';
import { creditosAPI } from '../services/api';
import { BoletoPdfLink, BoletoQrCode } from './BoletoMedia';
import DetalheRecarga from './DetalheRecarga';
import { useAuth } from '../contexts/AuthContext';

const ListaRecargas = ({ clienteId, onNovaRecarga }) => {
  const { usuario } = useAuth();
  const login = usuario?.usr_login || 'sistema';
  const [todasRecargas, setTodasRecargas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [remessaAberta, setRemessaAberta] = useState(null);
  const [qrCodeModal, setQrCodeModal] = useState(null);
  const [cancelModal, setCancelModal] = useState(null);
  const [cancelando, setCancelando] = useState(false);
  const [reemitindoId, setReemitindoId] = useState(null);
  const limit = 15;

  const carregarRecargas = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await creditosAPI.obterHistorico(clienteId, { limit: 500, offset: 0 });
      setTodasRecargas(response.data.data || []);
      setTotal(response.data.total || 0);
      setPage(0);
    } catch (err) {
      setError('Erro ao carregar recargas');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clienteId) carregarRecargas();
  }, [clienteId]);

  // Funções auxiliares (declaradas ANTES do uso em recargasFiltradas)
  const formatarData = (data) => {
    if (!data) return '-';
    const d = new Date(data);
    return d.toLocaleDateString('pt-BR');
  };

  const formatarMoeda = (valor) => {
    return (parseFloat(valor) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const handleSearch = (valor) => {
    setSearch(valor);
    setPage(0);
  };

  // Categoriza a situação consolidada da remessa.
  // Boleto pago vence sobre remessa cancelada — se o cliente pagou, a verdade é "Pago"
  // mesmo que a remessa tenha sido marcada como 'C' (race com cron / cancelamento manual
  // sem confirmação do EFI).
  const categoriaStatus = (r) => {
    const s = (r.boleto_status || '').toLowerCase();
    if (s === 'paid' || s === 'settled') return 'pago';
    if (r.status === 'C') return 'cancelado';
    if (s === 'canceled' || s === 'cancelled' || s === 'expired') return 'cancelado';
    if (s === 'waiting' || s === 'active' || s === 'pending') return 'pendente';
    if (!r.nota_fiscal_id) return 'cancelado';
    return 'pendente';
  };

  // Filtra recargas pelo texto de busca (remessa, restaurante, operador, data)
  const recargasFiltradas = todasRecargas.filter((r) => {
    if (statusFilter !== 'todos' && categoriaStatus(r) !== statusFilter) return false;
    if (!search.trim()) return true;
    const termo = search.toLowerCase().trim();
    const data = formatarData(r.data_criacao).toLowerCase();
    const remessa = String(r.remessa_id);
    const restaurante = (r.restaurante || '').toLowerCase();
    const operador = (r.criado_por || '').toLowerCase();
    const titulo = (r.titulo || '').toLowerCase();
    return data.includes(termo) || remessa.includes(termo) || restaurante.includes(termo) || operador.includes(termo) || titulo.includes(termo);
  });

  // Paginação sobre os filtrados
  const totalFiltrados = recargasFiltradas.length;
  const totalPaginasFiltradas = Math.ceil(totalFiltrados / limit);
  const recargasPagina = recargasFiltradas.slice(page * limit, (page + 1) * limit);

  const handleReemitirBoleto = async (remessa, e) => {
    e?.stopPropagation();
    setReemitindoId(remessa.remessa_id);
    try {
      await creditosAPI.reemitirBoleto(clienteId, remessa.remessa_id);
      alert('Boleto gerado com sucesso!');
      carregarRecargas();
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Erro ao gerar boleto';
      alert(msg);
    } finally {
      setReemitindoId(null);
    }
  };

  const handleCancelarRemessa = async () => {
    if (!cancelModal) return;
    setCancelando(true);
    try {
      await creditosAPI.cancelarRemessa(clienteId, cancelModal.remessa_id, login);
      alert('Remessa cancelada com sucesso!');
      setCancelModal(null);
      carregarRecargas();
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Erro ao cancelar remessa';
      alert(msg);
    } finally {
      setCancelando(false);
    }
  };

  // Mapeia o status do boleto para label/cores
  const formatarStatus = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'paid' || s === 'settled') {
      return { label: 'Pago', bg: '#dcfce7', color: '#15803d', border: '#86efac' };
    }
    if (s === 'canceled' || s === 'cancelled') {
      return { label: 'Cancelado', bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' };
    }
    if (s === 'expired') {
      return { label: 'Vencido', bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' };
    }
    if (s === 'waiting' || s === 'active' || s === 'pending') {
      return { label: 'Aguardando pagamento', bg: '#fef3c7', color: '#b45309', border: '#fcd34d' };
    }
    return null;
  };

  // Valor que o colaborador recebe. No tipo 'A' (acréscimo) recebe o valor cheio;
  // no 'D' (desconto) recebe bruto - taxa.
  const calcularLiquido = (valorBruto, taxa, tipo) => {
    const bruto = parseFloat(valorBruto) || 0;
    const t = parseFloat(taxa) || 0;
    if (t > 0 && tipo !== 'A') return Math.round((bruto - (bruto * t / 100)) * 100) / 100;
    return bruto;
  };

  // Valor do boleto (o que o restaurante paga). No tipo 'A' é bruto + taxa; no 'D' é o bruto.
  const calcularBoleto = (valorBruto, taxa, tipo) => {
    const bruto = parseFloat(valorBruto) || 0;
    const t = parseFloat(taxa) || 0;
    if (t > 0 && tipo === 'A') return Math.round((bruto + (bruto * t / 100)) * 100) / 100;
    return bruto;
  };

  // totalPaginas calculado acima como totalPaginasFiltradas

  // Se tem remessa aberta, mostra detalhe
  if (remessaAberta) {
    return (
      <DetalheRecarga
        clienteId={clienteId}
        remessaId={remessaAberta}
        onVoltar={() => setRemessaAberta(null)}
      />
    );
  }

  return (
    <div className="lista-recargas">
      <div className="page-header">
        <div>
          <h2 className="page-title">Histórico de recargas</h2>
          <p className="page-subtitle">Acompanhe todas as recargas realizadas</p>
        </div>
        <div className="page-header-actions">
          <button className="btn-selecionar" onClick={onNovaRecarga} style={{ padding: '12px 24px', fontSize: '0.9rem', borderRadius: '8px' }}>
            + Nova Recarga
          </button>
        </div>
      </div>

      {/* Barra de busca */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '20px',
        alignItems: 'center'
      }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <svg style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--cinza-500)' }}
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por remessa, data ou palavra-chave..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            style={{ paddingLeft: '38px', borderRadius: '8px', height: '42px' }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          style={{
            height: '42px',
            width: '180px',
            flex: '0 0 180px',
            padding: '0 14px',
            borderRadius: '8px',
            border: '1px solid var(--cinza-300)',
            background: '#fff',
            color: 'var(--cinza-800)',
            fontSize: '0.88rem',
            cursor: 'pointer'
          }}
        >
          <option value="todos">Todas situações</option>
          <option value="pago">Pago</option>
          <option value="pendente">Pendente</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <button
          className="btn-secundario"
          onClick={() => carregarRecargas(0)}
          style={{ height: '42px', padding: '0 20px' }}
        >
          Atualizar
        </button>
      </div>

      {/* Erro */}
      {error && <div className="alert alert-erro">{error}</div>}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--cinza-500)' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>...</div>
          Carregando recargas...
        </div>
      )}

      {/* Tabela */}
      {!loading && recargasPagina.length > 0 && (
        <>
          <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--cinza-300)' }}>
            <table style={{ minWidth: '800px' }}>
              <thead>
                <tr>
                  <th style={{ width: '90px' }}>Remessa</th>
                  <th style={{ width: '100px' }}>Data</th>
                  <th style={{ width: '140px', textAlign: 'center' }}>Status</th>
                  <th className="align-right" style={{ width: '110px' }}>Bruto</th>
                  <th className="align-right" style={{ width: '120px' }}>Líquido</th>
                  <th className="align-right" style={{ width: '90px' }}>Tar. Conv.</th>
                  <th>Empresa</th>
                  <th>Descrição</th>
                  <th className="align-right" style={{ width: '70px' }}>Colab.</th>
                  <th style={{ width: '100px', textAlign: 'center' }}>Boleto</th>
                </tr>
              </thead>
              <tbody>
                {recargasPagina.map((r) => {
                  const taxaAtual = parseFloat(r.taxa) || 0;
                  const tipo = r.tipo_taxa === 'A' ? 'A' : 'D';
                  const valorBruto = parseFloat(r.valor_bruto) || 0;
                  // Verdade histórica vem da nota fiscal; só calcula pelo tipo/taxa
                  // atuais quando a remessa não tem nota vinculada. Assim o valor não
                  // muda na tela se o restaurante trocar de tipo depois.
                  const temNota = r.nf_valor_boleto != null;
                  const valorBoleto = temNota ? (parseFloat(r.nf_valor_boleto) || 0) : calcularBoleto(valorBruto, taxaAtual, tipo);
                  const valorLiquido = temNota ? (parseFloat(r.nf_valor_movimentacao) || 0) : calcularLiquido(valorBruto, taxaAtual, tipo);
                  const taxaPct = temNota
                    ? (valorBruto > 0 ? Math.round((valorBoleto - valorLiquido) / valorBruto * 100 * 100) / 100 : 0)
                    : taxaAtual;
                  const boletoPago = ['paid', 'settled'].includes((r.boleto_status || '').toLowerCase());
                  const cancelada = r.status === 'C' && !boletoPago;
                  const comErro = r.status === 'E';

                  return (
                    <tr key={r.remessa_id} style={{ cursor: 'pointer', opacity: cancelada ? 0.6 : 1 }} onClick={() => setRemessaAberta(r.remessa_id)}>
                      <td>
                        <span style={{
                          background: 'var(--cinza-100)',
                          padding: '3px 10px',
                          borderRadius: '6px',
                          fontFamily: 'monospace',
                          fontWeight: '700',
                          fontSize: '0.85rem',
                          color: 'var(--roxo)'
                        }}>
                          #{r.remessa_id}
                        </span>
                      </td>
                      <td style={{ fontWeight: '500' }}>{formatarData(r.data_criacao)}</td>
                      <td style={{ textAlign: 'center' }}>
                        {(() => {
                          // Prioridade: boleto pago > rem_status C/E > boleto_status > fallback
                          // Se o boleto está pago, esse é o estado verdadeiro mesmo que a remessa
                          // tenha sido marcada como 'C' por engano.
                          let st;
                          if (boletoPago) st = formatarStatus(r.boleto_status);
                          else if (cancelada) st = formatarStatus('canceled');
                          else if (comErro) st = { label: 'Erro no boleto', bg: '#fffbeb', color: '#b45309', border: '#fde68a' };
                          else st = formatarStatus(r.boleto_status);
                          if (!st) {
                            if (!r.nota_fiscal_id) st = formatarStatus('canceled');
                            else st = formatarStatus('waiting');
                          }
                          return (
                            <span style={{
                              background: st.bg,
                              color: st.color,
                              border: `1px solid ${st.border}`,
                              padding: '3px 10px',
                              borderRadius: '999px',
                              fontWeight: '600',
                              fontSize: '0.75rem',
                              whiteSpace: 'nowrap'
                            }}>
                              {st.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="align-right" style={{ fontWeight: '500', color: 'var(--cinza-800)' }}>
                        {formatarMoeda(valorBoleto)}
                      </td>
                      <td className="align-right" style={{ fontWeight: '700', color: '#491d4e', fontSize: '0.95rem' }}>
                        {formatarMoeda(valorLiquido)}
                      </td>
                      <td className="align-right" style={{ fontSize: '0.8rem', color: taxaPct > 0 ? 'var(--erro)' : 'var(--cinza-500)' }}>
                        {taxaPct > 0 ? `${taxaPct}%` : '-'}
                      </td>
                      <td style={{ fontWeight: '500' }}>{r.restaurante || '-'}</td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--cinza-600)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.titulo || '-'}
                      </td>
                      <td className="align-right">
                        <span style={{
                          background: '#f3e8ff',
                          color: 'var(--roxo)',
                          padding: '2px 10px',
                          borderRadius: '999px',
                          fontWeight: '600',
                          fontSize: '0.8rem'
                        }}>
                          {r.total_colaboradores}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        {comErro ? (
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button
                              title="Tentar gerar boleto novamente"
                              onClick={(e) => handleReemitirBoleto(r, e)}
                              disabled={reemitindoId === r.remessa_id}
                              style={{
                                background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px',
                                padding: '5px 7px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                opacity: reemitindoId === r.remessa_id ? 0.5 : 1
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                              </svg>
                            </button>
                            <button
                              title="Cancelar Remessa"
                              onClick={() => setCancelModal(r)}
                              style={{
                                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px',
                                padding: '5px 7px', cursor: 'pointer', display: 'flex', alignItems: 'center'
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                              </svg>
                            </button>
                          </div>
                        ) : r.nota_fiscal_id && !cancelada ? (
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button
                              title="QR Code PIX"
                              onClick={() => setQrCodeModal(r)}
                              style={{
                                background: '#f3e8ff', border: '1px solid #d8b4fe', borderRadius: '6px',
                                padding: '5px 7px', cursor: 'pointer', display: 'flex', alignItems: 'center'
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4A1D4F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                              </svg>
                            </button>
                            <BoletoPdfLink
                              notaId={r.nota_fiscal_id}
                              title="Visualizar Boleto PDF"
                              style={{
                                background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px',
                                padding: '5px 7px', cursor: 'pointer', display: 'flex', alignItems: 'center'
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                              </svg>
                            </BoletoPdfLink>
                            {!cancelada && !boletoPago && (
                              <button
                                title="Cancelar Remessa"
                                onClick={() => setCancelModal(r)}
                                style={{
                                  background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px',
                                  padding: '5px 7px', cursor: 'pointer', display: 'flex', alignItems: 'center'
                                }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                                </svg>
                              </button>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--cinza-400)' }}>-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {totalPaginasFiltradas > 1 && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '16px',
              padding: '0 4px'
            }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--cinza-600)' }}>
                {totalFiltrados} registro(s) &middot; Página {page + 1} de {totalPaginasFiltradas}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn-secundario"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 0}
                  style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                >
                  Anterior
                </button>
                <button
                  className="btn-secundario"
                  onClick={() => setPage(page + 1)}
                  disabled={page >= totalPaginasFiltradas - 1}
                  style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal QR Code PIX */}
      {qrCodeModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }} onClick={() => setQrCodeModal(null)}>
          <div style={{
            background: '#fff', borderRadius: '20px', padding: '36px 32px',
            maxWidth: '440px', width: '90%', textAlign: 'center', position: 'relative'
          }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setQrCodeModal(null)} style={{
              position: 'absolute', top: '12px', right: '16px', background: 'none',
              border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#9ca3af'
            }}>&times;</button>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '12px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4A1D4F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
              </svg>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#4A1D4F' }}>Pagamento via PIX</h3>
            </div>

            <p style={{ margin: '0 0 4px', fontSize: '0.8rem', color: '#6b7280' }}>
              Remessa #{qrCodeModal.remessa_id} &middot; {qrCodeModal.restaurante}
            </p>

            <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#4A1D4F', marginBottom: '20px' }}>
              {formatarMoeda(qrCodeModal.nf_valor_boleto != null ? (parseFloat(qrCodeModal.nf_valor_boleto) || 0) : calcularBoleto(qrCodeModal.valor_bruto, qrCodeModal.taxa, qrCodeModal.tipo_taxa === 'A' ? 'A' : 'D'))}
            </div>

            {qrCodeModal.nota_fiscal_id && (
              <div style={{ marginBottom: '16px' }}>
                <BoletoQrCode
                  notaId={qrCodeModal.nota_fiscal_id}
                  alt="QR Code PIX"
                  style={{ width: '220px', height: '220px', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '8px', background: '#fff' }}
                />
              </div>
            )}

            {qrCodeModal.boleto_pix_qrcode && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  PIX Copia e Cola
                </div>
                <div style={{
                  background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px',
                  padding: '10px 12px', fontSize: '0.7rem', fontFamily: 'monospace',
                  wordBreak: 'break-all', color: '#374151', maxHeight: '70px', overflow: 'auto', lineHeight: '1.4'
                }}>
                  {qrCodeModal.boleto_pix_qrcode}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(qrCodeModal.boleto_pix_qrcode);
                    alert('Código PIX copiado!');
                  }}
                  style={{
                    marginTop: '10px', padding: '10px 24px', fontSize: '0.85rem', fontWeight: '600',
                    color: '#fff', background: '#4A1D4F', border: 'none', borderRadius: '8px', cursor: 'pointer'
                  }}
                >
                  Copiar código PIX
                </button>
              </div>
            )}

            {qrCodeModal.boleto_linha_digitavel && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Linha Digitável
                </div>
                <div style={{
                  background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px',
                  padding: '8px 12px', fontSize: '0.78rem', fontFamily: 'monospace', color: '#374151'
                }}>
                  {qrCodeModal.boleto_linha_digitavel}
                </div>
              </div>
            )}

            {qrCodeModal.boleto_status && (
              <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '8px' }}>
                Status: <span style={{
                  fontWeight: '600',
                  color: qrCodeModal.boleto_status === 'paid' ? '#059669' : qrCodeModal.boleto_status === 'waiting' ? '#d97706' : '#6b7280'
                }}>
                  {qrCodeModal.boleto_status === 'waiting' ? 'Aguardando pagamento' : qrCodeModal.boleto_status === 'paid' ? 'Pago' : qrCodeModal.boleto_status}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Confirmação de Cancelamento */}
      {cancelModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }} onClick={() => !cancelando && setCancelModal(null)}>
          <div style={{
            background: '#fff', borderRadius: '20px', padding: '36px 32px',
            maxWidth: '440px', width: '90%', textAlign: 'center', position: 'relative'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '50%',
              background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>

            <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', color: '#111827' }}>
              Cancelar Remessa #{cancelModal.remessa_id}?
            </h3>

            <p style={{ margin: '0 0 8px', color: '#6b7280', fontSize: '0.88rem' }}>
              <strong>{cancelModal.restaurante}</strong> &middot; {formatarMoeda(cancelModal.nf_valor_boleto != null ? (parseFloat(cancelModal.nf_valor_boleto) || 0) : calcularBoleto(cancelModal.valor_bruto, cancelModal.taxa, cancelModal.tipo_taxa === 'A' ? 'A' : 'D'))}
            </p>

            <p style={{ margin: '0 0 24px', color: '#dc2626', fontSize: '0.82rem', fontWeight: '600' }}>
              Esta ação não pode ser desfeita!
            </p>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setCancelModal(null)}
                disabled={cancelando}
                style={{
                  padding: '10px 24px', fontSize: '0.88rem', fontWeight: '500',
                  color: '#374151', background: '#f3f4f6', border: '1px solid #d1d5db',
                  borderRadius: '8px', cursor: 'pointer'
                }}
              >
                Não, manter
              </button>
              <button
                onClick={handleCancelarRemessa}
                disabled={cancelando}
                style={{
                  padding: '10px 24px', fontSize: '0.88rem', fontWeight: '600',
                  color: '#fff', background: '#dc2626', border: 'none',
                  borderRadius: '8px', cursor: cancelando ? 'not-allowed' : 'pointer',
                  opacity: cancelando ? 0.7 : 1
                }}
              >
                {cancelando ? 'Cancelando...' : 'Sim, cancelar tudo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vazio */}
      {!loading && recargasPagina.length === 0 && !error && (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          background: 'var(--cinza-100)',
          borderRadius: '12px',
          border: '1px solid var(--cinza-300)'
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px', opacity: 0.4 }}>📋</div>
          <p style={{ margin: '0 0 8px', fontWeight: '600', color: 'var(--cinza-800)' }}>
            Nenhuma recarga encontrada
          </p>
          <p style={{ margin: '0 0 20px', fontSize: '0.85rem', color: 'var(--cinza-600)' }}>
            Comece gerando sua primeira recarga de crédito
          </p>
          <button className="btn-selecionar" onClick={onNovaRecarga} style={{ padding: '10px 24px' }}>
            + Nova Recarga
          </button>
        </div>
      )}
    </div>
  );
};

export default ListaRecargas;
