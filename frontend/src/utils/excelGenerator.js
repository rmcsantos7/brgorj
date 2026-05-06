/**
 * Gerador de Relatórios Excel — BR Gorjeta
 * Usa SheetJS (xlsx) para gerar .xlsx
 */

import * as XLSX from 'xlsx';

const formatarCPF = (cpf) => {
  if (!cpf) return '';
  const limpo = (cpf + '').replace(/\D/g, '');
  if (limpo.length === 11) return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return cpf;
};

const formatarCNPJ = (cnpj) => {
  if (!cnpj) return '';
  const c = (cnpj + '').replace(/\D/g, '');
  if (c.length === 14) return c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return cnpj;
};

const formatarTelefone = (tel) => {
  if (!tel) return '';
  const l = (tel + '').replace(/\D/g, '');
  if (l.length === 11) return `(${l.slice(0, 2)}) ${l[2]} ${l.slice(3, 7)}-${l.slice(7)}`;
  if (l.length === 10) return `(${l.slice(0, 2)}) ${l.slice(2, 6)}-${l.slice(6)}`;
  return tel;
};

const formatarData = (data) => {
  if (!data) return '';
  const raw = String(data);
  const s = raw.length === 10 && raw.includes('-') ? raw + 'T00:00:00' : raw;
  const d = new Date(s);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('pt-BR');
};

const formatarDataHora = (data) => {
  if (!data) return '';
  const d = new Date(data);
  if (isNaN(d.getTime())) return String(data);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const numero = (v) => parseFloat(v) || 0;

const autoSizeCols = (rows) => {
  if (!rows.length) return [];
  const keys = Object.keys(rows[0]);
  return keys.map(k => {
    const maxLen = Math.max(
      k.length,
      ...rows.map(r => String(r[k] ?? '').length)
    );
    return { wch: Math.min(Math.max(maxLen + 2, 10), 50) };
  });
};

// ============================================================
// RELATÓRIO 1: Recargas por Período
// ============================================================

export const gerarExcelRecargasPeriodo = (dados) => {
  const wb = XLSX.utils.book_new();

  const meta = [
    ['Relatório de Recarga por Período'],
    [],
    ['Cliente', dados.cliente?.nome_fantasia || dados.cliente?.razao_social || ''],
    ['CNPJ', formatarCNPJ(dados.cliente?.cnpj)],
    ['Período', `${formatarData(dados.periodo.inicio)} a ${formatarData(dados.periodo.fim)}`],
    [],
    ['Resumo'],
    ['Total de Recargas', dados.total_recargas || 0],
    ['Efetuadas', dados.total_efetuadas || 0, numero(dados.valor_efetuado)],
    ['Canceladas', dados.total_canceladas || 0, numero(dados.valor_cancelado)],
    ['Pendentes', dados.total_pendentes || 0, numero(dados.valor_pendente)],
    ['Valor Efetuado (canceladas excluídas)', '', numero(dados.valor_efetuado)],
    ['Emitido em', new Date().toLocaleString('pt-BR')],
    []
  ];

  const ws = XLSX.utils.aoa_to_sheet(meta);

  const header = ['Remessa', 'Data da Recarga', 'Vencimento', 'Pagamento', 'Status', 'Valor'];
  const body = (dados.remessas || []).map(r => ({
    'Remessa': `#${r.remessa_id}`,
    'Data da Recarga': formatarData(r.data_recarga),
    'Vencimento': r.data_vencimento ? formatarData(r.data_vencimento) : '',
    'Pagamento': r.data_pagamento ? formatarData(r.data_pagamento) : '',
    'Status': r.status_label || '',
    'Valor': numero(r.valor_recarga)
  }));

  XLSX.utils.sheet_add_aoa(ws, [header], { origin: `A${meta.length + 1}` });
  XLSX.utils.sheet_add_json(ws, body, { origin: `A${meta.length + 2}`, skipHeader: true });

  const totalRow = [['', '', '', '', 'TOTAL EFETUADO', numero(dados.valor_efetuado)]];
  XLSX.utils.sheet_add_aoa(ws, totalRow, { origin: `A${meta.length + 2 + body.length}` });

  ws['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Recargas');
  XLSX.writeFile(wb, `Relatorio_Recargas_${dados.periodo.inicio}_a_${dados.periodo.fim}.xlsx`);
};

// ============================================================
// RELATÓRIO 2: Colaboradores Cadastrados
// ============================================================

export const gerarExcelColaboradores = (dados) => {
  const wb = XLSX.utils.book_new();

  const mapColab = (c) => ({
    'Nome': c.nome || '',
    'CPF': formatarCPF(c.cpf),
    'Telefone': formatarTelefone(c.telefone),
    'Data Nascimento': formatarData(c.data_nascimento),
    'Categoria': c.categoria || '',
    'Criado em': formatarDataHora(c.criado_em),
    'Status': c.status || ''
  });

  const ativos = (dados.ativos || []).map(mapColab);
  const inativos = (dados.inativos || []).map(mapColab);

  if (ativos.length) {
    const ws = XLSX.utils.json_to_sheet(ativos);
    ws['!cols'] = autoSizeCols(ativos);
    XLSX.utils.book_append_sheet(wb, ws, 'Ativos');
  } else {
    const ws = XLSX.utils.aoa_to_sheet([['Nenhum colaborador ativo']]);
    XLSX.utils.book_append_sheet(wb, ws, 'Ativos');
  }

  if (inativos.length) {
    const ws = XLSX.utils.json_to_sheet(inativos);
    ws['!cols'] = autoSizeCols(inativos);
    XLSX.utils.book_append_sheet(wb, ws, 'Inativos');
  } else {
    const ws = XLSX.utils.aoa_to_sheet([['Nenhum colaborador inativo']]);
    XLSX.utils.book_append_sheet(wb, ws, 'Inativos');
  }

  XLSX.writeFile(wb, `Relatorio_Colaboradores_${new Date().toISOString().split('T')[0]}.xlsx`);
};

// ============================================================
// RELATÓRIO 3: Histórico por Colaborador
// ============================================================

export const gerarExcelHistoricoColaborador = (dados) => {
  const wb = XLSX.utils.book_new();

  const meta = [
    ['Histórico de Recebimentos'],
    [],
    ['Colaborador', dados.colaborador?.nome || ''],
    ['CPF', formatarCPF(dados.colaborador?.cpf)],
    ['Período', `${formatarData(dados.periodo.inicio)} a ${formatarData(dados.periodo.fim)}`],
    ['Total no Período', numero(dados.total_geral)],
    ['Emitido em', new Date().toLocaleString('pt-BR')],
    []
  ];

  const rows = [];
  (dados.meses || []).forEach(mes => {
    const mesLabel = mes.label.charAt(0).toUpperCase() + mes.label.slice(1);
    (mes.creditos || []).forEach(c => {
      rows.push({
        'Mês': mesLabel,
        'Tipo': 'Gorjeta',
        'Valor Recebido': numero(c.valor)
      });
    });
    rows.push({ 'Mês': mesLabel, 'Tipo': 'Total do mês', 'Valor Recebido': numero(mes.total) });
  });

  const ws = XLSX.utils.aoa_to_sheet(meta);
  if (rows.length) {
    XLSX.utils.sheet_add_json(ws, rows, { origin: `A${meta.length + 1}` });
  } else {
    XLSX.utils.sheet_add_aoa(ws, [['Nenhum crédito encontrado no período']], { origin: `A${meta.length + 1}` });
  }

  ws['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Histórico');

  const nome = (dados.colaborador?.nome || 'colaborador').replace(/[^a-zA-Z0-9]/g, '_');
  XLSX.writeFile(wb, `Historico_${nome}_${dados.periodo.inicio}_a_${dados.periodo.fim}.xlsx`);
};
