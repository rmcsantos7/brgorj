/**
 * Componente: PreviewCredito
 * Preview e confirmação de geração de crédito
 * Mostra valor bruto, desconto da taxa e valor líquido por colaborador
 */

import React, { useState } from 'react';
import { creditosAPI } from '../services/api';
import { BoletoPdfLink, BoletoQrCode } from './BoletoMedia';
import CurrencyInput from './CurrencyInput';

const PreviewCredito = ({ clienteId, colaboradores: colaboradoresIniciais, onVoltar, onSucesso, creditoHook, taxa = 0, tipo = 'D' }) => {
  // 'A' = acréscimo (restaurante paga a taxa por cima; colaborador recebe o valor cheio)
  // 'D' = desconto (taxa sai do colaborador; boleto = valor bruto)
  const isAcrescimo = tipo === 'A';
  /**
   * Formata CPF com máscara 000.000.000-00
   */
  const formatarCPF = (cpf) => {
    if (!cpf) return '-';
    const limpo = cpf.replace(/\D/g, '');
    if (limpo.length === 11) {
      return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    return cpf;
  };
  // Estado local com valores editáveis por colaborador
  const [colaboradores, setColaboradores] = useState(
    colaboradoresIniciais.map(c => ({
      ...c,
      valor: c.valor !== undefined && c.valor !== null && c.valor !== '' && c.valor !== 0
        ? String(c.valor)
        : ''
    }))
  );

  const hojeISO = () => new Date().toISOString().split('T')[0];
  const amanhaISO = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  };

  const [tituloRecarga, setTituloRecarga] = useState('');
  const [agendar, setAgendar] = useState(false);
  const [dataDisponibilizacao, setDataDisponibilizacao] = useState(amanhaISO);
  const [sucesso, setSucesso] = useState(null);

  /**
   * Atualiza valor de um colaborador específico
   */
  const handleValorChange = (idx, novoValor) => {
    setColaboradores(prev => prev.map((c, i) =>
      i === idx ? { ...c, valor: novoValor } : c
    ));
  };

  /**
   * Calcula valor líquido após desconto da taxa
   */
  const calcularLiquido = (valorBruto) => {
    const v = parseFloat(valorBruto) || 0;
    // No acréscimo o colaborador recebe o valor cheio — a taxa vai para o boleto.
    if (taxa > 0 && !isAcrescimo) {
      return Math.round((v - (v * taxa / 100)) * 100) / 100;
    }
    return v;
  };

  /**
   * Calcula desconto da taxa
   */
  const calcularDesconto = (valorBruto) => {
    const v = parseFloat(valorBruto) || 0;
    if (taxa > 0) {
      return Math.round((v * taxa / 100) * 100) / 100;
    }
    return 0;
  };

  /**
   * Calcula totais
   */
  const totalBruto = colaboradores.reduce((acc, c) => acc + (parseFloat(c.valor) || 0), 0);
  const totalDesconto = colaboradores.reduce((acc, c) => acc + calcularDesconto(c.valor), 0);
  const totalLiquido = colaboradores.reduce((acc, c) => acc + calcularLiquido(c.valor), 0);
  // Valor do boleto = o que o restaurante paga (acréscimo: bruto + taxa; desconto: bruto)
  const totalBoleto = isAcrescimo ? Math.round((totalBruto + totalDesconto) * 100) / 100 : totalBruto;

  /**
   * Gera crédito
   */
  const handleGerar = async () => {
    // Valida que todos têm valor
    const semValor = colaboradores.filter(c => !c.valor || parseFloat(c.valor) <= 0);
    if (semValor.length > 0) {
      alert(`${semValor.length} colaborador(es) sem valor definido. Preencha todos os valores.`);
      return;
    }

    // Limpa erro anterior
    creditoHook.limparErro();

    const payload = {
      titulo: tituloRecarga.trim() || null,
      dataDisponibilizacao: agendar ? (dataDisponibilizacao || null) : hojeISO(),
      colaboradores: colaboradores.map(c => ({
        id: c.id || 0,
        cpf: c.cpf || '',
        nome: c.nome || '',
        valor: parseFloat(c.valor)
      })),
    };

    const dados = await creditoHook.gerar(payload);
    if (dados) {
      setSucesso({
        total_inseridos: dados.total_inseridos || colaboradores.length,
        valor_total: dados.valor_total || totalLiquido,
        valor_bruto: totalBruto,
        valor_desconto: totalDesconto,
        valor_liquido: totalLiquido,
        valor_boleto: totalBoleto,
        remessa_id: dados.remessa_id || null,
        nota_fiscal_id: dados.nota_fiscal_id || null,
        boleto: dados.boleto || null,
        boleto_erro: dados.boleto_erro || null
      });
    }
  };

  /**
   * Fecha modal de sucesso e volta
   */
  const handleFecharSucesso = () => {
    setSucesso(null);
    creditoHook.limparSucesso();
    onSucesso();
  };

  const todosPreenchidos = colaboradores.every(c => c.valor && parseFloat(c.valor) > 0);

  // Tela de sucesso
  if (sucesso) {
    const boleto = sucesso.boleto;

    return (
      <div className="preview-credito">
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '40px 20px',
          textAlign: 'center'
        }}>
          <div style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: '#10b981',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px'
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h3 style={{ margin: '0 0 8px', fontSize: '1.3rem', color: '#111827' }}>
            Recarga gerada com sucesso!
          </h3>

          <p style={{ margin: '0 0 24px', color: '#6b7280', fontSize: '0.9rem' }}>
            A recarga foi inserida no sistema.
          </p>

          {/* Cards resumo */}
          <div style={{
            display: 'flex',
            gap: '16px',
            justifyContent: 'center',
            flexWrap: 'wrap',
            marginBottom: '32px'
          }}>
            <div style={{ background: '#f3f4f6', borderRadius: '10px', padding: '16px 24px', minWidth: '120px' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Registros
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111827' }}>
                {sucesso.total_inseridos || colaboradores.length}
              </div>
            </div>

            {sucesso.remessa_id && (
              <div style={{ background: '#f3f4f6', borderRadius: '10px', padding: '16px 24px', minWidth: '120px' }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  ID da Remessa
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111827' }}>
                  {sucesso.remessa_id}
                </div>
              </div>
            )}

            <div style={{ background: '#f3f4f6', borderRadius: '10px', padding: '16px 24px', minWidth: '120px' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {isAcrescimo ? 'Colaboradores Recebem' : 'Valor Bruto'}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#374151' }}>
                {(isAcrescimo ? sucesso.valor_liquido : sucesso.valor_bruto).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </div>
            </div>

            {taxa > 0 && (
              <div style={{ background: '#fef2f2', borderRadius: '10px', padding: '16px 24px', minWidth: '120px' }}>
                <div style={{ fontSize: '0.75rem', color: '#dc2626', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Tar. Conv. ({taxa}%)
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#dc2626' }}>
                  {isAcrescimo ? '+' : '-'} {sucesso.valor_desconto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
              </div>
            )}

            <div style={{ background: '#f0fdf4', borderRadius: '10px', padding: '16px 24px', minWidth: '120px' }}>
              <div style={{ fontSize: '0.75rem', color: '#059669', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {isAcrescimo ? 'Valor do Boleto' : 'Valor Líquido'}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#4A1D4F' }}>
                {(isAcrescimo ? sucesso.valor_boleto : sucesso.valor_liquido).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </div>
            </div>
          </div>

          {/* Erro ao gerar boleto (nota foi criada, mas boleto falhou) */}
          {sucesso.boleto_erro && !sucesso.boleto && (
            <div style={{
              width: '100%',
              maxWidth: '480px',
              background: '#fef2f2',
              border: '2px solid #fecaca',
              borderRadius: '12px',
              padding: '16px 20px',
              marginBottom: '20px',
              color: '#991b1b'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', fontWeight: 700, fontSize: '0.9rem' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                Erro ao gerar boleto
              </div>
              <div style={{ fontSize: '0.82rem', lineHeight: '1.5' }}>
                A recarga foi registrada (nota fiscal #{sucesso.nota_fiscal_id}), mas o boleto não pôde ser gerado:
                <br />
                <strong>{sucesso.boleto_erro}</strong>
              </div>
            </div>
          )}

          {/* Seção do Boleto / QR Code PIX */}
          {sucesso.nota_fiscal_id && sucesso.boleto && (
            <div style={{
              width: '100%',
              maxWidth: '480px',
              background: '#fff',
              border: '2px solid #e5e7eb',
              borderRadius: '16px',
              padding: '28px 24px',
              marginBottom: '28px',
              textAlign: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '20px' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4A1D4F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                </svg>
                <h4 style={{ margin: 0, fontSize: '1.05rem', color: '#4A1D4F' }}>Pagamento via PIX</h4>
              </div>

              {/* QR Code Image */}
              <div style={{ marginBottom: '16px' }}>
                <BoletoQrCode
                  notaId={sucesso.nota_fiscal_id}
                  alt="QR Code PIX"
                  style={{
                    width: '220px',
                    height: '220px',
                    borderRadius: '12px',
                    border: '1px solid #e5e7eb',
                    padding: '8px',
                    background: '#fff'
                  }}
                />
              </div>

              {/* PIX Copia e Cola */}
              {boleto && boleto.pix_qrcode && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    PIX Copia e Cola
                  </div>
                  <div style={{
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    fontSize: '0.72rem',
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                    color: '#374151',
                    maxHeight: '80px',
                    overflow: 'auto',
                    lineHeight: '1.4'
                  }}>
                    {boleto.pix_qrcode}
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(boleto.pix_qrcode);
                      alert('Código PIX copiado!');
                    }}
                    style={{
                      marginTop: '8px',
                      padding: '8px 20px',
                      fontSize: '0.82rem',
                      fontWeight: '600',
                      color: '#fff',
                      background: '#4A1D4F',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    Copiar código PIX
                  </button>
                </div>
              )}

              {/* Linha digitável */}
              {boleto && boleto.linha_digitavel && (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Linha Digitável
                  </div>
                  <div style={{
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '0.8rem',
                    fontFamily: 'monospace',
                    color: '#374151'
                  }}>
                    {boleto.linha_digitavel}
                  </div>
                </div>
              )}

              {/* Botão baixar PDF */}
              <BoletoPdfLink
                notaId={sucesso.nota_fiscal_id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginTop: '8px',
                  padding: '10px 24px',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  color: '#4A1D4F',
                  background: '#f3e8ff',
                  border: '1px solid #d8b4fe',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                Visualizar Boleto PDF
              </BoletoPdfLink>
            </div>
          )}

          <button
            className="btn-primario"
            onClick={handleFecharSucesso}
            style={{ minWidth: '200px' }}
          >
            OK
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="preview-credito">
      {/* Erro da API */}
      {creditoHook.creditoError && (
        <div className="alert alert-erro">
          {creditoHook.creditoError}
        </div>
      )}

      {/* Info da taxa */}
      {taxa > 0 && (
        <div style={{
          padding: '10px 16px',
          background: '#fef3c7',
          border: '1px solid #fcd34d',
          borderRadius: '8px',
          marginBottom: '12px',
          fontSize: '0.85rem',
          color: '#92400e'
        }}>
          Tarifa convênio ({isAcrescimo ? 'acréscimo no boleto' : 'desconto do colaborador'}): <strong>{taxa}%</strong>
        </div>
      )}

      {/* Legenda */}
      {taxa > 0 && (
        <div style={{
          padding: '8px 14px',
          background: '#f9fafb',
          border: '1px solid var(--cinza-300)',
          borderRadius: '8px',
          marginBottom: '12px',
          fontSize: '0.78rem',
          color: 'var(--cinza-600)',
          lineHeight: '1.6'
        }}>
          {isAcrescimo ? (
            <>
              <strong>Valor distribuído:</strong> valor cheio que cada colaborador recebe. &nbsp;|&nbsp;
              <strong>Tarifa Convênio:</strong> acréscimo pago pelo restaurante, conforme acordo coletivo. &nbsp;|&nbsp;
              <strong>Valor do Boleto:</strong> valor bruto + tarifa, valor final a pagar.
            </>
          ) : (
            <>
              <strong>Valor Bruto:</strong> corresponde ao valor final apresentado no boleto. &nbsp;|&nbsp;
              <strong>Tarifa Convênio:</strong> valor definido conforme acordo coletivo. &nbsp;|&nbsp;
              <strong>Valor Líquido:</strong> valor que será distribuído entre os colaboradores.
            </>
          )}
        </div>
      )}

      {/* Título da recarga e Data de disponibilização */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1', minWidth: '250px' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--cinza-700)', marginBottom: '6px' }}>
            Título da recarga <span style={{ fontWeight: '400', color: 'var(--cinza-500)' }}>(opcional, máx. 40 caracteres)</span>
          </label>
          <input
            type="text"
            maxLength={40}
            placeholder="Ex: Recarga mensal março"
            value={tituloRecarga}
            onChange={(e) => setTituloRecarga(e.target.value)}
            disabled={creditoHook.creditoLoading}
            style={{ width: '100%', maxWidth: '400px', padding: '8px 12px', borderRadius: '8px', fontSize: '0.9rem' }}
          />
          <div style={{ fontSize: '0.72rem', color: 'var(--cinza-500)', marginTop: '4px' }}>
            {tituloRecarga.length}/40
          </div>
        </div>
        <div style={{ minWidth: '220px' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--cinza-700)', marginBottom: '6px' }}>
            Agendar recarga
          </label>
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: '10px',
            cursor: creditoHook.creditoLoading ? 'not-allowed' : 'pointer',
            padding: '6px 0'
          }}>
            <span style={{
              position: 'relative', display: 'inline-block',
              width: '40px', height: '22px',
              background: agendar ? '#4A1D4F' : '#d1d5db',
              borderRadius: '999px', transition: 'background 0.2s'
            }}>
              <input
                type="checkbox"
                checked={agendar}
                onChange={(e) => setAgendar(e.target.checked)}
                disabled={creditoHook.creditoLoading}
                style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
              />
              <span style={{
                position: 'absolute', top: '2px', left: agendar ? '20px' : '2px',
                width: '18px', height: '18px', background: '#fff',
                borderRadius: '50%', transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
              }} />
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--cinza-700)' }}>
              {agendar ? 'Sim' : 'Não (liberar hoje)'}
            </span>
          </label>
          {agendar && (
            <div style={{ marginTop: '8px' }}>
              <input
                type="date"
                value={dataDisponibilizacao}
                min={hojeISO()}
                onChange={(e) => setDataDisponibilizacao(e.target.value)}
                disabled={creditoHook.creditoLoading}
                style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '0.9rem' }}
              />
              <div style={{ fontSize: '0.72rem', color: 'var(--cinza-500)', marginTop: '4px' }}>
                Data de disponibilização do crédito
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabela de Colaboradores com valores editáveis */}
      <div className="tabela-preview">
        <table>
          <thead>
            <tr>
              <th style={{ width: '40px' }}>#</th>
              <th>Nome</th>
              <th>CPF</th>
              <th className="align-right" style={{ width: '130px' }}>{isAcrescimo ? 'Valor' : 'Valor Bruto'}</th>
              {taxa > 0 && !isAcrescimo && (
                <>
                  <th className="align-right" style={{ width: '110px' }}>Tar. Conv.</th>
                  <th className="align-right" style={{ width: '110px' }}>Líquido</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {colaboradores.map((colab, idx) => {
              const valorBruto = parseFloat(colab.valor) || 0;
              const desconto = calcularDesconto(colab.valor);
              const liquido = calcularLiquido(colab.valor);

              return (
                <tr key={idx}>
                  <td>{idx + 1}</td>
                  <td>{colab.nome}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--cinza-600)' }}>{formatarCPF(colab.cpf)}</td>
                  <td className="align-right">
                    <CurrencyInput
                      value={colab.valor}
                      onChange={(novo) => handleValorChange(idx, novo)}
                      disabled={creditoHook.creditoLoading}
                      style={{
                        width: '110px',
                        textAlign: 'right',
                        padding: '6px 8px',
                        fontSize: '0.85rem'
                      }}
                    />
                  </td>
                  {taxa > 0 && !isAcrescimo && (
                    <>
                      <td className="align-right" style={{ color: '#dc2626', fontSize: '0.85rem' }}>
                        {valorBruto > 0 ? `- ${desconto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                      </td>
                      <td className="align-right" style={{ fontWeight: '600', fontSize: '0.85rem', color: '#059669' }}>
                        {valorBruto > 0 ? liquido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {colaboradores.length > 50 && (
          <p className="txt-info">
            Exibindo {Math.min(colaboradores.length, 50)} de {colaboradores.length} colaboradores
          </p>
        )}
      </div>

      {/* Resumo */}
      <div className="secao resumo-final" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
              {colaboradores.length} colaborador(es)
            </span>
            {!todosPreenchidos && (
              <span style={{ fontSize: '0.8rem', color: '#d97706', marginLeft: '12px' }}>
                Preencha todos os valores para continuar
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
            {taxa > 0 && (
              <>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{isAcrescimo ? 'Colaboradores Recebem' : 'Valor Total do Boleto'}</span>
                  <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#374151' }}>
                    {(isAcrescimo ? totalLiquido : totalBruto).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>Tar. Conv. ({taxa}%)</span>
                  <div style={{ fontSize: '1rem', fontWeight: '600', color: '#dc2626' }}>
                    {isAcrescimo ? '+' : '-'} {totalDesconto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                </div>
              </>
            )}
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{taxa > 0 ? (isAcrescimo ? 'Valor Total do Boleto' : 'Valor Líquido') : 'Valor Total'}</span>
              <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#4A1D4F' }}>
                {(isAcrescimo ? totalBoleto : totalLiquido).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Botões */}
      <div className="acoes">
        <button
          className="btn-voltar"
          onClick={onVoltar}
          disabled={creditoHook.creditoLoading}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Voltar
        </button>
        <button
          className="btn-primario"
          onClick={handleGerar}
          disabled={creditoHook.creditoLoading || !todosPreenchidos}
        >
          {creditoHook.creditoLoading ? 'Gerando...' : 'Gerar Recarga'}
        </button>
      </div>
    </div>
  );
};

export default PreviewCredito;
