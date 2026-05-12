/**
 * Componente: DetalheRecarga
 * Detalhe completo de uma remessa — cabeçalho, resumo e lista de colaboradores
 */

import React, { useState, useEffect } from 'react';
import { creditosAPI } from '../services/api';
import { BoletoPdfLink, BoletoQrCode } from './BoletoMedia';
import { gerarPdfRemessa } from '../utils/pdfGenerator';
import { useAuth } from '../contexts/AuthContext';

// Nota fiscal ID está em dados.boleto.nota_fiscal_id

const DetalheRecarga = ({ clienteId, remessaId, onVoltar }) => {
  const { usuario } = useAuth();
  const login = usuario?.usr_login || 'sistema';
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mostrarQrCode, setMostrarQrCode] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [mostrarConfirmacao, setMostrarConfirmacao] = useState(false);
  const [reemitindo, setReemitindo] = useState(false);

  useEffect(() => {
    if (clienteId && remessaId) {
      carregarDetalhes();
    }
  }, [clienteId, remessaId]);

  const carregarDetalhes = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await creditosAPI.obterDetalheRemessa(clienteId, remessaId);
      setDados(response.data.data);
    } catch (err) {
      setError('Erro ao carregar detalhes da remessa');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatarData = (data) => {
    if (!data) return '-';
    const d = new Date(data);
    return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatarMoeda = (valor) => {
    return (parseFloat(valor) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const handleReemitirBoleto = async () => {
    setReemitindo(true);
    try {
      await creditosAPI.reemitirBoleto(clienteId, remessaId);
      alert('Boleto gerado com sucesso!');
      carregarDetalhes();
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Erro ao gerar boleto';
      alert(msg);
    } finally {
      setReemitindo(false);
    }
  };

  const handleCancelar = async () => {
    setCancelando(true);
    try {
      await creditosAPI.cancelarRemessa(clienteId, remessaId, login);
      alert('Remessa cancelada com sucesso!');
      onVoltar();
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Erro ao cancelar remessa';
      alert(msg);
    } finally {
      setCancelando(false);
      setMostrarConfirmacao(false);
    }
  };

  // Mapeia status (combinando crd_rem_status e boleto_status) para badge visual.
  // Boleto pago vence sobre remessa cancelada — se o cliente pagou, mostramos "Pago"
  // mesmo que a remessa tenha sido marcada como 'C' (race com cancelamento manual / cron).
  const formatarStatusBadge = (remStatus, boletoStatus, temNotaFiscal) => {
    const s = (boletoStatus || '').toLowerCase();
    if (s === 'paid' || s === 'settled') return { label: 'Pago', bg: '#dcfce7', color: '#15803d', border: '#86efac' };
    if (remStatus === 'C') return { label: 'Cancelada', bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' };
    if (remStatus === 'E') return { label: 'Erro no boleto', bg: '#fffbeb', color: '#b45309', border: '#fde68a' };
    if (s === 'expired') return { label: 'Vencido', bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' };
    if (s === 'waiting' || s === 'active' || s === 'pending') return { label: 'Aguardando pagamento', bg: '#fef3c7', color: '#b45309', border: '#fcd34d' };
    if (temNotaFiscal) return { label: 'Aguardando pagamento', bg: '#fef3c7', color: '#b45309', border: '#fcd34d' };
    return { label: 'Sem boleto', bg: 'var(--cinza-100)', color: 'var(--cinza-600)', border: 'var(--cinza-300)' };
  };

  const formatarCPF = (cpf) => {
    if (!cpf) return '-';
    const limpo = cpf.replace(/\D/g, '');
    if (limpo.length === 11) {
      return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    return cpf;
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
        Carregando detalhes da remessa...
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Erro
  if (error) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div className="alert alert-erro" style={{ display: 'inline-block' }}>{error}</div>
        <div style={{ marginTop: '16px' }}>
          <button className="btn-voltar" onClick={onVoltar} style={{ marginRight: '8px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Voltar
          </button>
          <button className="btn-selecionar" onClick={carregarDetalhes}>Tentar novamente</button>
        </div>
      </div>
    );
  }

  if (!dados) return null;

  const taxa = dados.taxa || 0;
  const totalDesconto = taxa > 0 ? Math.round((dados.valor_bruto - dados.valor_liquido) * 100) / 100 : 0;
  const boletoPago = ['paid', 'settled'].includes((dados.boleto?.status || '').toLowerCase());
  // Se o boleto foi pago, o estado real é "pago" — mesmo que o status no DB esteja 'C'
  const remessaCancelada = dados.status === 'C' && !boletoPago;
  const statusBadge = formatarStatusBadge(dados.status, dados.boleto?.status, !!dados.boleto?.nota_fiscal_id);

  return (
    <div className="detalhe-recarga">
      <button className="btn-voltar" onClick={onVoltar}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Voltar
      </button>

      <div className="page-header">
        <div>
          <div className="page-header-info" style={{ marginBottom: '4px' }}>
            <h2 className="page-title">Remessa #{remessaId}</h2>
            <span style={{
              background: statusBadge.bg,
              color: statusBadge.color,
              border: `1px solid ${statusBadge.border}`,
              padding: '4px 12px',
              borderRadius: '999px',
              fontWeight: '600',
              fontSize: '0.78rem',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              whiteSpace: 'nowrap'
            }}>
              {statusBadge.label}
            </span>
          </div>
          <p className="page-subtitle">Detalhes completos da recarga</p>
        </div>
        <div className="page-header-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {dados.boleto && dados.boleto.nota_fiscal_id && !remessaCancelada && (
            <>
              <button className="btn-secundario" style={{ padding: '8px 16px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={() => setMostrarQrCode(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                </svg>
                QR Code PIX
              </button>
              <BoletoPdfLink
                notaId={dados.boleto.nota_fiscal_id}
                className="btn-secundario"
                style={{ padding: '8px 16px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                Visualizar Boleto
              </BoletoPdfLink>
            </>
          )}
          <button className="btn-secundario" style={{ padding: '8px 16px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={() => gerarPdfRemessa({ ...dados, remessa_id: remessaId })}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Relatório
          </button>
          {dados.status === 'E' && (
            <button
              onClick={handleReemitirBoleto}
              disabled={reemitindo}
              style={{
                padding: '8px 16px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px',
                background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', borderRadius: '8px',
                cursor: reemitindo ? 'not-allowed' : 'pointer', fontWeight: '500'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
              </svg>
              {reemitindo ? 'Gerando...' : 'Tentar Gerar Boleto'}
            </button>
          )}
          {dados.status !== 'C' && !boletoPago && (
            <button
              onClick={() => setMostrarConfirmacao(true)}
              disabled={cancelando}
              style={{
                padding: '8px 16px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px',
                background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px',
                cursor: cancelando ? 'not-allowed' : 'pointer', fontWeight: '500'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
              {cancelando ? 'Cancelando...' : 'Cancelar Remessa'}
            </button>
          )}
        </div>
      </div>

      {/* Info Cards Row */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        {/* Empresa */}
        {dados.restaurante && (
          <div className="section-card" style={{ marginBottom: 0, flex: '1 1 180px', minWidth: '160px' }}>
            <div className="form-label-upper">Empresa</div>
            <div className="info-value">{dados.restaurante}</div>
          </div>
        )}

        {/* Título da Remessa */}
        {dados.titulo && (
          <div className="section-card" style={{ marginBottom: 0, flex: '1 1 180px', minWidth: '160px' }}>
            <div className="form-label-upper">Título</div>
            <div className="info-value">{dados.titulo}</div>
          </div>
        )}

        {/* Operador */}
        <div className="section-card" style={{ marginBottom: 0, flex: '2 1 280px', minWidth: '240px' }}>
          <div className="form-label-upper">Operador</div>
          <div className="info-value" style={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}>
            {dados.criado_por || '-'}
          </div>
        </div>

        {/* Data */}
        <div className="section-card" style={{ marginBottom: 0, flex: '1 1 180px', minWidth: '160px' }}>
          <div className="form-label-upper">Data de Criação</div>
          <div className="info-value">{formatarData(dados.data_criacao)}</div>
        </div>

        {/* Total Colaboradores */}
        <div className="section-card" style={{ marginBottom: 0, flex: '0 1 130px', minWidth: '110px' }}>
          <div className="form-label-upper">Colab.</div>
          <div className="info-value" style={{ fontWeight: '700', color: 'var(--roxo)' }}>{dados.total_colaboradores}</div>
        </div>
      </div>

      {/* Resumo Financeiro */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        {/* Valor Bruto */}
        <div style={{
          flex: 1, minWidth: '160px',
          background: 'linear-gradient(135deg, #f8f9fa 0%, #f3f4f6 100%)',
          border: '1px solid var(--cinza-300)',
          borderRadius: '12px', padding: '18px 20px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--cinza-500)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '6px' }}>
            Valor Bruto
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: '700', color: 'var(--cinza-800)' }}>
            {formatarMoeda(dados.valor_bruto)}
          </div>
        </div>

        {/* Taxa */}
        {taxa > 0 && (
          <div style={{
            flex: 1, minWidth: '160px',
            background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
            border: '1px solid #fecaca',
            borderRadius: '12px', padding: '18px 20px', textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.7rem', color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '6px' }}>
              Tar. Conv. ({taxa}%)
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: '700', color: '#dc2626' }}>
              - {formatarMoeda(totalDesconto)}
            </div>
          </div>
        )}

        {/* Valor Líquido */}
        <div style={{
          flex: 1, minWidth: '160px',
          background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
          border: '1px solid #bbf7d0',
          borderRadius: '12px', padding: '18px 20px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '0.7rem', color: '#059669', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '6px' }}>
            Valor Líquido
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--roxo)' }}>
            {formatarMoeda(dados.valor_liquido)}
          </div>
        </div>
      </div>

      {/* Legenda */}
      <div style={{
        padding: '10px 14px',
        background: '#f9fafb',
        border: '1px solid var(--cinza-300)',
        borderRadius: '8px',
        marginBottom: '20px',
        fontSize: '0.78rem',
        color: 'var(--cinza-600)',
        lineHeight: '1.6'
      }}>
        <strong>Valor Bruto:</strong> corresponde ao valor final apresentado no boleto. &nbsp;|&nbsp;
        <strong>Tarifa Convênio:</strong> valor definido conforme acordo coletivo. &nbsp;|&nbsp;
        <strong>Valor Líquido:</strong> valor que será distribuído entre os colaboradores.
      </div>

      {/* Tabela de Colaboradores */}
      <div style={{ marginBottom: '8px' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '1rem', fontWeight: '700', color: 'var(--cinza-800)' }}>
          Colaboradores ({dados.colaboradores?.length || 0})
        </h3>
      </div>

      <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--cinza-300)' }}>
        <table style={{ minWidth: '600px' }}>
          <thead>
            <tr>
              <th style={{ width: '40px' }}>#</th>
              <th>Nome</th>
              <th style={{ width: '140px' }}>CPF</th>
              {taxa > 0 && (
                <>
                  <th className="align-right" style={{ width: '120px' }}>Bruto</th>
                  <th className="align-right" style={{ width: '100px' }}>Tar. Conv.</th>
                </>
              )}
              <th className="align-right" style={{ width: '130px' }}>
                {taxa > 0 ? 'Líquido' : 'Valor'}
              </th>
            </tr>
          </thead>
          <tbody>
            {(dados.colaboradores || []).map((colab, idx) => {
              const desconto = colab.valor_bruto - colab.valor_liquido;
              return (
                <tr key={colab.credito_id || idx}>
                  <td style={{ color: 'var(--cinza-500)', fontSize: '0.8rem' }}>{idx + 1}</td>
                  <td style={{ fontWeight: '500' }}>{colab.nome || '-'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--cinza-600)' }}>
                    {formatarCPF(colab.cpf)}
                  </td>
                  {taxa > 0 && (
                    <>
                      <td className="align-right" style={{ fontWeight: '500', color: 'var(--cinza-800)' }}>
                        {formatarMoeda(colab.valor_bruto)}
                      </td>
                      <td className="align-right" style={{ fontSize: '0.85rem', color: '#dc2626' }}>
                        {desconto > 0 ? `- ${formatarMoeda(desconto)}` : '-'}
                      </td>
                    </>
                  )}
                  <td className="align-right" style={{ fontWeight: '700', color: 'var(--sucesso)', fontSize: '0.95rem' }}>
                    {formatarMoeda(colab.valor_liquido)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {/* Footer com totais */}
          <tfoot>
            <tr style={{ background: 'var(--cinza-100)', fontWeight: '700' }}>
              <td colSpan={taxa > 0 ? 3 : 3} style={{ textAlign: 'right', paddingRight: '12px', color: 'var(--cinza-600)', fontSize: '0.85rem' }}>
                TOTAIS
              </td>
              {taxa > 0 && (
                <>
                  <td className="align-right" style={{ color: 'var(--cinza-800)' }}>
                    {formatarMoeda(dados.valor_bruto)}
                  </td>
                  <td className="align-right" style={{ color: '#dc2626', fontSize: '0.85rem' }}>
                    - {formatarMoeda(totalDesconto)}
                  </td>
                </>
              )}
              <td className="align-right" style={{ color: 'var(--roxo)', fontSize: '1rem' }}>
                {formatarMoeda(dados.valor_liquido)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Modal Confirmação de Cancelamento */}
      {mostrarConfirmacao && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }} onClick={() => !cancelando && setMostrarConfirmacao(false)}>
          <div style={{
            background: '#fff', borderRadius: '20px', padding: '36px 32px',
            maxWidth: '440px', width: '90%', textAlign: 'center', position: 'relative'
          }} onClick={(e) => e.stopPropagation()}>
            {/* Ícone de alerta */}
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
              Cancelar Remessa #{remessaId}?
            </h3>

            <p style={{ margin: '0 0 8px', color: '#6b7280', fontSize: '0.88rem', lineHeight: '1.5' }}>
              Esta ação irá:
            </p>
            <ul style={{ textAlign: 'left', margin: '0 0 20px', padding: '0 20px', color: '#6b7280', fontSize: '0.85rem', lineHeight: '1.8' }}>
              <li>Cancelar o boleto na EFI (se estiver em aberto)</li>
              <li>Marcar a remessa, os créditos e a nota fiscal como cancelados</li>
              <li>Os registros são preservados no histórico</li>
            </ul>

            <p style={{ margin: '0 0 24px', color: '#dc2626', fontSize: '0.82rem', fontWeight: '600' }}>
              Esta ação não pode ser desfeita!
            </p>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setMostrarConfirmacao(false)}
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
                onClick={handleCancelar}
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

      {/* Modal QR Code PIX */}
      {mostrarQrCode && dados.boleto && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }} onClick={() => setMostrarQrCode(false)}>
          <div style={{
            background: '#fff', borderRadius: '20px', padding: '36px 32px',
            maxWidth: '440px', width: '90%', textAlign: 'center', position: 'relative'
          }} onClick={(e) => e.stopPropagation()}>
            {/* Fechar */}
            <button onClick={() => setMostrarQrCode(false)} style={{
              position: 'absolute', top: '12px', right: '16px', background: 'none',
              border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#9ca3af'
            }}>&times;</button>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '20px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4A1D4F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
              </svg>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#4A1D4F' }}>Pagamento via PIX</h3>
            </div>

            <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#4A1D4F', marginBottom: '20px' }}>
              {formatarMoeda(dados.valor_bruto)}
            </div>

            {/* QR Code Image */}
            <div style={{ marginBottom: '16px' }}>
              <BoletoQrCode
                notaId={dados.boleto.nota_fiscal_id}
                alt="QR Code PIX"
                style={{ width: '220px', height: '220px', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '8px', background: '#fff' }}
              />
            </div>

            {/* PIX Copia e Cola */}
            {dados.boleto.pix_qrcode && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  PIX Copia e Cola
                </div>
                <div style={{
                  background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px',
                  padding: '10px 12px', fontSize: '0.7rem', fontFamily: 'monospace',
                  wordBreak: 'break-all', color: '#374151', maxHeight: '70px', overflow: 'auto', lineHeight: '1.4'
                }}>
                  {dados.boleto.pix_qrcode}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(dados.boleto.pix_qrcode);
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

            {/* Linha digitável */}
            {dados.boleto.linha_digitavel && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Linha Digitável
                </div>
                <div style={{
                  background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px',
                  padding: '8px 12px', fontSize: '0.78rem', fontFamily: 'monospace', color: '#374151'
                }}>
                  {dados.boleto.linha_digitavel}
                </div>
              </div>
            )}

            {/* Status */}
            <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '8px' }}>
              Status: <span style={{
                fontWeight: '600',
                color: dados.boleto.status === 'paid' ? '#059669' : dados.boleto.status === 'waiting' ? '#d97706' : '#6b7280'
              }}>
                {dados.boleto.status === 'waiting' ? 'Aguardando pagamento' : dados.boleto.status === 'paid' ? 'Pago' : dados.boleto.status}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DetalheRecarga;
