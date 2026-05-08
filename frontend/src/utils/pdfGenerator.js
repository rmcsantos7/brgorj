/**
 * Gerador de Relatórios PDF — BR Gorjeta
 * Usa jsPDF + jspdf-autotable para gerar PDFs profissionais
 *
 * 3 Relatórios:
 *  1. Relatório de Recarga por Período
 *  2. Relatório de Colaboradores Cadastrados
 *  3. Relatório Total por Colaborador (Histórico de Recebimentos)
 */

import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { LOGO_BASE64 } from './logoBase64';

// Cores da marca BR Gorjeta
const CORES = {
  roxo: [74, 29, 79],        // #4A1D4F
  rosa: [233, 75, 147],      // #E94B93
  cinzaEscuro: [55, 65, 81], // #374151
  cinzaMedio: [107, 114, 128],// #6B7280
  cinzaClaro: [243, 244, 246],// #F3F4F6
  branco: [255, 255, 255],
  verde: [5, 150, 105],      // #059669
  vermelho: [220, 38, 38],   // #DC2626
};

// ============================================================
// HELPERS
// ============================================================

const formatarCPF = (cpf) => {
  if (!cpf) return '-';
  const limpo = (cpf + '').replace(/\D/g, '');
  if (limpo.length === 11) {
    return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  return cpf;
};

const formatarCNPJ = (cnpj) => {
  if (!cnpj) return '-';
  const c = (cnpj + '').replace(/\D/g, '');
  if (c.length === 14) {
    return c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return cnpj;
};

const formatarMoeda = (valor) => {
  return (parseFloat(valor) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const formatarData = (data) => {
  if (!data) return '-';
  const raw = String(data);
  // Datas "YYYY-MM-DD" são interpretadas como UTC — adicionar T00:00:00 força horário local
  const dateStr = raw.length === 10 && raw.includes('-') ? raw + 'T00:00:00' : raw;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('pt-BR');
};

const formatarDataHora = (data) => {
  if (!data) return '-';
  const d = new Date(data);
  if (isNaN(d.getTime())) return String(data);
  return d.toLocaleDateString('pt-BR') + ' - ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const formatarTelefone = (tel) => {
  if (!tel) return '-';
  const limpo = (tel + '').replace(/\D/g, '');
  if (limpo.length === 11) {
    return `(${limpo.slice(0, 2)}) ${limpo[2]} ${limpo.slice(3, 7)}-${limpo.slice(7)}`;
  }
  if (limpo.length === 10) {
    return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 6)}-${limpo.slice(6)}`;
  }
  return tel;
};

// ============================================================
// HEADER & FOOTER COMUNS
// ============================================================

/**
 * Desenha o header do PDF com logo e título
 */
const desenharHeader = (doc, titulo) => {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Barra roxa no topo
  doc.setFillColor(...CORES.roxo);
  doc.rect(0, 0, pageWidth, 42, 'F');

  // Faixa rosa fina
  doc.setFillColor(...CORES.rosa);
  doc.rect(0, 42, pageWidth, 3, 'F');

  // Logo da empresa
  try {
    // Proporção original 823x271 (ratio ~3.04:1)
    const logoH = 28;
    const logoW = logoH * 3.04;
    doc.addImage(LOGO_BASE64, 'PNG', 14, 7, logoW, logoH);
  } catch {
    // Fallback: texto caso a imagem falhe
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...CORES.branco);
    doc.text('BR Gorjeta', 20, 27);
  }

  // Título do relatório (branco sobre fundo roxo)
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...CORES.branco);
  doc.text(titulo, pageWidth - 20, 27, { align: 'right' });

  return 55; // Y position after header
};

/**
 * Desenha footer em todas as páginas
 */
const adicionarFooter = (doc) => {
  const totalPages = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Linha separadora
    doc.setDrawColor(...CORES.cinzaMedio);
    doc.setLineWidth(0.3);
    doc.line(20, pageHeight - 25, pageWidth - 20, pageHeight - 25);

    // Texto do footer
    doc.setFontSize(7);
    doc.setTextColor(...CORES.cinzaMedio);
    doc.setFont('helvetica', 'normal');
    doc.text('BR Gorjeta - Sistema de Gestao de Gorjetas', 20, pageHeight - 18);
    doc.text(`Pagina ${i} de ${totalPages}`, pageWidth - 20, pageHeight - 18, { align: 'right' });

    const agora = new Date();
    doc.text(
      `Gerado em ${agora.toLocaleDateString('pt-BR')} as ${agora.toLocaleTimeString('pt-BR')}`,
      20, pageHeight - 12
    );
  }
};

/**
 * Desenha informações do solicitante
 */
const desenharInfoCliente = (doc, cliente, y) => {
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...CORES.cinzaEscuro);
  doc.text('Solicitante:', 20, y);
  doc.setFont('helvetica', 'normal');
  doc.text(cliente.nome || '-', 70, y);

  y += 14;
  doc.setFont('helvetica', 'bold');
  doc.text('CNPJ:', 20, y);
  doc.setFont('helvetica', 'normal');
  doc.text(formatarCNPJ(cliente.cnpj), 70, y);

  return y + 10;
};

// ============================================================
// RELATÓRIO 1: Recargas no Período
// ============================================================

export const gerarPdfRecargasPeriodo = (dados) => {
  const doc = new jsPDF('portrait', 'pt', 'a4');
  let y = desenharHeader(doc, 'Relatório de Recarga por Período');

  // Info do cliente
  y = desenharInfoCliente(doc, dados.cliente, y);

  // Data de Emissão
  y += 6;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...CORES.cinzaMedio);
  doc.text(`Data de Emissão: ${new Date().toLocaleString('pt-BR')}`, 20, y);

  // Cards de resumo: total, efetuado, cancelado, pendente
  y += 20;
  const cardW = 120;
  const cardH = 50;
  const cards = [
    { label: 'Total de Recargas', value: String(dados.total_recargas || 0), color: CORES.cinzaEscuro },
    { label: `Efetuadas (${dados.total_efetuadas || 0})`, value: formatarMoeda(dados.valor_efetuado), color: [21, 128, 61] },
    { label: `Canceladas (${dados.total_canceladas || 0})`, value: formatarMoeda(dados.valor_cancelado), color: [185, 28, 28] },
    { label: `Pendentes (${dados.total_pendentes || 0})`, value: formatarMoeda(dados.valor_pendente), color: [180, 83, 9] }
  ];

  const cardGap = 10;
  const totalCardsWidth = cards.length * cardW + (cards.length - 1) * cardGap;
  let cardX = (doc.internal.pageSize.getWidth() - totalCardsWidth) / 2;

  cards.forEach(card => {
    doc.setFillColor(...CORES.cinzaClaro);
    doc.roundedRect(cardX, y, cardW, cardH, 4, 4, 'F');

    doc.setFontSize(7);
    doc.setTextColor(...CORES.cinzaMedio);
    doc.setFont('helvetica', 'normal');
    doc.text(card.label.toUpperCase(), cardX + cardW / 2, y + 16, { align: 'center' });

    doc.setFontSize(11);
    doc.setTextColor(...card.color);
    doc.setFont('helvetica', 'bold');
    doc.text(card.value, cardX + cardW / 2, y + 36, { align: 'center' });

    cardX += cardW + cardGap;
  });

  y += cardH + 12;

  // Linha do período centralizada
  doc.setFontSize(8);
  doc.setTextColor(...CORES.cinzaMedio);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Período: ${formatarData(dados.periodo.inicio)} a ${formatarData(dados.periodo.fim)}`,
    doc.internal.pageSize.getWidth() / 2,
    y,
    { align: 'center' }
  );
  y += 14;

  // Tabela detalhada com status, vencimento e data de pagamento
  if (dados.remessas && dados.remessas.length > 0) {
    doc.autoTable({
      startY: y,
      head: [['Remessa', 'Data Recarga', 'Vencimento', 'Pagamento', 'Status', 'Valor']],
      body: dados.remessas.map(r => [
        `#${r.remessa_id}`,
        formatarData(r.data_recarga),
        r.data_vencimento ? formatarData(r.data_vencimento) : '-',
        r.data_pagamento ? formatarData(r.data_pagamento) : '-',
        r.status_label || '-',
        formatarMoeda(r.valor_recarga)
      ]),
      foot: [['', '', '', '', 'EFETUADO', formatarMoeda(dados.valor_efetuado)]],
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 6,
        lineColor: [229, 231, 235],
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: CORES.roxo,
        textColor: CORES.branco,
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'center'
      },
      footStyles: {
        fillColor: CORES.cinzaClaro,
        textColor: CORES.roxo,
        fontStyle: 'bold',
        fontSize: 9,
        halign: 'center'
      },
      columnStyles: {
        0: { halign: 'center' },
        1: { halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'center' },
        4: { halign: 'center' },
        5: { halign: 'right' }
      },
      alternateRowStyles: {
        fillColor: [250, 250, 252]
      },
      margin: { left: 20, right: 20 }
    });
  } else {
    doc.setFontSize(10);
    doc.setTextColor(...CORES.cinzaMedio);
    doc.text('Nenhuma recarga encontrada no período informado.', 20, y);
  }

  adicionarFooter(doc);
  doc.save(`Relatorio_Recargas_${dados.periodo.inicio}_a_${dados.periodo.fim}.pdf`);
};

// ============================================================
// RELATÓRIO 2: Colaboradores Cadastrados
// ============================================================

export const gerarPdfColaboradores = (dados) => {
  const doc = new jsPDF('landscape', 'pt', 'a4');
  let y = desenharHeader(doc, 'Relatório de Colaboradores Cadastrados');

  // Info do cliente
  y = desenharInfoCliente(doc, dados.cliente, y);

  // Data de Emissão
  y += 6;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...CORES.cinzaMedio);
  doc.text(`Data de emissao: ${new Date().toLocaleDateString('pt-BR')}`, 20, y);

  y += 20;

  // ---- ATIVOS ----
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...CORES.verde);
  doc.text('Colaboradores Ativos', 20, y);

  doc.setFontSize(9);
  doc.setTextColor(...CORES.cinzaMedio);
  doc.text(`Total de ativos: ${dados.total_ativos}`, doc.internal.pageSize.getWidth() - 20, y, { align: 'right' });

  y += 10;

  if (dados.ativos.length > 0) {
    doc.autoTable({
      startY: y,
      head: [['Nome', 'CPF', 'Telefone', 'Data Nascimento', 'Categoria', 'Criado em', 'Status']],
      body: dados.ativos.map(c => [
        c.nome || '-',
        formatarCPF(c.cpf),
        formatarTelefone(c.telefone),
        formatarData(c.data_nascimento),
        c.categoria || '-',
        formatarDataHora(c.criado_em),
        c.status
      ]),
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 6,
        lineColor: [229, 231, 235],
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: CORES.roxo,
        textColor: CORES.branco,
        fontStyle: 'bold',
        fontSize: 8
      },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 100 },
        2: { cellWidth: 100 },
        3: { cellWidth: 80, halign: 'center' },
        4: { cellWidth: 90 },
        5: { cellWidth: 120 },
        6: { cellWidth: 50, halign: 'center' }
      },
      alternateRowStyles: { fillColor: [250, 250, 252] },
      margin: { left: 20, right: 20 }
    });

    y = doc.lastAutoTable.finalY + 25;
  } else {
    y += 15;
    doc.setFontSize(9);
    doc.setTextColor(...CORES.cinzaMedio);
    doc.text('Nenhum colaborador ativo.', 20, y);
    y += 20;
  }

  // ---- INATIVOS ----
  // Verifica se precisa nova página
  if (y > doc.internal.pageSize.getHeight() - 120) {
    doc.addPage();
    y = desenharHeader(doc, 'Relatório de Colaboradores Cadastrados');
  }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...CORES.vermelho);
  doc.text('Colaboradores Inativos', 20, y);

  doc.setFontSize(9);
  doc.setTextColor(...CORES.cinzaMedio);
  doc.text(`Total de inativos: ${dados.total_inativos}`, doc.internal.pageSize.getWidth() - 20, y, { align: 'right' });

  y += 10;

  if (dados.inativos.length > 0) {
    doc.autoTable({
      startY: y,
      head: [['Nome', 'CPF', 'Telefone', 'Data Nascimento', 'Categoria', 'Criado em', 'Status']],
      body: dados.inativos.map(c => [
        c.nome || '-',
        formatarCPF(c.cpf),
        formatarTelefone(c.telefone),
        formatarData(c.data_nascimento),
        c.categoria || '-',
        formatarDataHora(c.criado_em),
        c.status
      ]),
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 6,
        lineColor: [229, 231, 235],
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: [127, 29, 29], // vermelho escuro
        textColor: CORES.branco,
        fontStyle: 'bold',
        fontSize: 8
      },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 100 },
        2: { cellWidth: 100 },
        3: { cellWidth: 80, halign: 'center' },
        4: { cellWidth: 90 },
        5: { cellWidth: 120 },
        6: { cellWidth: 50, halign: 'center' }
      },
      alternateRowStyles: { fillColor: [254, 242, 242] },
      margin: { left: 20, right: 20 }
    });
  } else {
    y += 15;
    doc.setFontSize(9);
    doc.setTextColor(...CORES.cinzaMedio);
    doc.text('Nenhum colaborador inativo.', 20, y);
  }

  adicionarFooter(doc);
  doc.save(`Relatorio_Colaboradores_${new Date().toISOString().split('T')[0]}.pdf`);
};

// ============================================================
// RELATÓRIO 3: Histórico Total por Colaborador
// ============================================================

export const gerarPdfHistoricoColaborador = (dados) => {
  const doc = new jsPDF('portrait', 'pt', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = desenharHeader(doc, 'Histórico de Recebimentos');

  // Info do cliente
  y = desenharInfoCliente(doc, dados.cliente, y);

  // Data de Emissão
  y += 6;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...CORES.cinzaMedio);
  doc.text(`Data de emissao: ${new Date().toLocaleDateString('pt-BR')}`, 20, y);

  // Card do colaborador
  y += 18;
  doc.setFillColor(...CORES.cinzaClaro);
  doc.roundedRect(20, y, pageWidth - 40, 60, 4, 4, 'F');

  // Faixa lateral roxa
  doc.setFillColor(...CORES.roxo);
  doc.rect(20, y, 4, 60, 'F');

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...CORES.roxo);
  doc.text(dados.colaborador.nome || '-', 34, y + 20);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...CORES.cinzaEscuro);
  doc.text(`Documento: ${formatarCPF(dados.colaborador.cpf)}`, 34, y + 35);

  doc.text(`Período: ${formatarData(dados.periodo.inicio)} a ${formatarData(dados.periodo.fim)}`, 34, y + 50);

  // Total geral (no canto direito do card)
  doc.setFontSize(8);
  doc.setTextColor(...CORES.cinzaMedio);
  doc.text('Total no periodo', pageWidth - 30, y + 18, { align: 'right' });

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...CORES.roxo);
  doc.text(formatarMoeda(dados.total_geral), pageWidth - 30, y + 36, { align: 'right' });

  y += 75;

  // Meses
  if (dados.meses && dados.meses.length > 0) {
    dados.meses.forEach(mes => {
      // Verifica espaço
      const estimatedHeight = 40 + (mes.creditos.length * 22);
      if (y + estimatedHeight > doc.internal.pageSize.getHeight() - 50) {
        doc.addPage();
        y = desenharHeader(doc, 'Histórico de Recebimentos');
      }

      // Cabeçalho do mês — capitalizar primeira letra
      const mesLabel = mes.label.charAt(0).toUpperCase() + mes.label.slice(1);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...CORES.roxo);
      doc.text(mesLabel, 20, y);

      // Total do mês
      doc.setFontSize(9);
      doc.setTextColor(...CORES.cinzaEscuro);
      doc.text(`Total: ${formatarMoeda(mes.total)}`, pageWidth - 20, y, { align: 'right' });

      y += 6;

      // Tabela do mês
      doc.autoTable({
        startY: y,
        head: [['Tipo', 'Valor Recebido']],
        body: mes.creditos.map(c => [
          'Gorjeta',
          formatarMoeda(c.valor)
        ]),
        foot: [['Total inserido', formatarMoeda(mes.total)]],
        theme: 'grid',
        styles: {
          fontSize: 9,
          cellPadding: 7,
          lineColor: [229, 231, 235],
          lineWidth: 0.5,
        },
        headStyles: {
          fillColor: CORES.roxo,
          textColor: CORES.branco,
          fontStyle: 'bold',
          fontSize: 8,
        },
        footStyles: {
          fillColor: CORES.cinzaClaro,
          textColor: CORES.roxo,
          fontStyle: 'bold',
          fontSize: 9,
        },
        columnStyles: {
          0: { cellWidth: 'auto' },
          1: { halign: 'right', cellWidth: 150 }
        },
        alternateRowStyles: { fillColor: [250, 250, 252] },
        margin: { left: 20, right: 20 }
      });

      y = doc.lastAutoTable.finalY + 20;
    });
  } else {
    doc.setFontSize(10);
    doc.setTextColor(...CORES.cinzaMedio);
    doc.text('Nenhum crédito encontrado no período informado.', 20, y);
  }

  adicionarFooter(doc);
  const nomeArq = (dados.colaborador.nome || 'colaborador').replace(/\s+/g, '_');
  doc.save(`Historico_${nomeArq}_${dados.periodo.inicio}_a_${dados.periodo.fim}.pdf`);
};

// ============================================================
// RELATÓRIO 4: Detalhe de uma Remessa
// ============================================================

export const gerarPdfRemessa = (dados) => {
  const temTaxa = (dados.taxa || 0) > 0;
  const orientation = temTaxa ? 'landscape' : 'portrait';
  const doc = new jsPDF(orientation, 'pt', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();

  const tituloRelatorio = dados.titulo
    ? `Remessa #${dados.remessa_id} - ${dados.titulo}`
    : `Remessa #${dados.remessa_id}`;

  let y = desenharHeader(doc, `Relatório da ${tituloRelatorio}`);

  // Info cards: Empresa, Operador, Data
  const infos = [];
  if (dados.restaurante) infos.push({ label: 'Empresa', value: dados.restaurante });
  infos.push({ label: 'Operador', value: dados.criado_por || '-' });
  infos.push({ label: 'Data de Criacao', value: formatarDataHora(dados.data_criacao) });
  infos.push({ label: 'Colaboradores', value: String(dados.total_colaboradores || (dados.colaboradores || []).length) });

  const infoCardW = Math.min(160, (pageWidth - 40 - (infos.length - 1) * 10) / infos.length);
  const totalInfoW = infos.length * infoCardW + (infos.length - 1) * 10;
  let infoX = (pageWidth - totalInfoW) / 2;

  infos.forEach(info => {
    doc.setFillColor(...CORES.cinzaClaro);
    doc.roundedRect(infoX, y, infoCardW, 42, 4, 4, 'F');

    doc.setFontSize(7);
    doc.setTextColor(...CORES.cinzaMedio);
    doc.setFont('helvetica', 'normal');
    doc.text(info.label.toUpperCase(), infoX + infoCardW / 2, y + 14, { align: 'center' });

    // Reduz fonte se o valor (ex.: e-mail do operador) for mais largo que o card
    doc.setFont('helvetica', 'bold');
    const maxValueWidth = infoCardW - 10;
    let valueFontSize = 10;
    doc.setFontSize(valueFontSize);
    while (valueFontSize > 6 && doc.getTextWidth(info.value) > maxValueWidth) {
      valueFontSize -= 0.5;
      doc.setFontSize(valueFontSize);
    }
    doc.setTextColor(...CORES.cinzaEscuro);
    doc.text(info.value, infoX + infoCardW / 2, y + 32, { align: 'center' });

    infoX += infoCardW + 10;
  });

  y += 56;

  // Resumo financeiro
  const taxa = dados.taxa || 0;
  const valorBruto = parseFloat(dados.valor_bruto) || 0;
  const valorLiquido = parseFloat(dados.valor_liquido) || 0;
  const totalDesconto = temTaxa ? Math.round((valorBruto - valorLiquido) * 100) / 100 : 0;

  const finCards = [
    { label: 'Valor Bruto', value: formatarMoeda(valorBruto), color: CORES.cinzaEscuro }
  ];
  if (temTaxa) {
    finCards.push({ label: `Tar. Conv. (${taxa}%)`, value: `- ${formatarMoeda(totalDesconto)}`, color: CORES.vermelho });
  }
  finCards.push({ label: 'Valor Liquido', value: formatarMoeda(valorLiquido), color: CORES.roxo });

  const finCardW = Math.min(180, (pageWidth - 40 - (finCards.length - 1) * 12) / finCards.length);
  const totalFinW = finCards.length * finCardW + (finCards.length - 1) * 12;
  let finX = (pageWidth - totalFinW) / 2;

  finCards.forEach(card => {
    doc.setFillColor(...CORES.cinzaClaro);
    doc.roundedRect(finX, y, finCardW, 50, 4, 4, 'F');

    doc.setFontSize(7);
    doc.setTextColor(...CORES.cinzaMedio);
    doc.setFont('helvetica', 'normal');
    doc.text(card.label.toUpperCase(), finX + finCardW / 2, y + 16, { align: 'center' });

    doc.setFontSize(14);
    doc.setTextColor(...card.color);
    doc.setFont('helvetica', 'bold');
    doc.text(card.value, finX + finCardW / 2, y + 38, { align: 'center' });

    finX += finCardW + 12;
  });

  y += 66;

  // Tabela de colaboradores
  const colaboradores = dados.colaboradores || [];
  if (colaboradores.length > 0) {
    const headRow = temTaxa
      ? ['#', 'Nome', 'CPF', 'Valor Bruto', 'Tar. Conv.', 'Valor Liquido']
      : ['#', 'Nome', 'CPF', 'Valor'];

    const bodyRows = colaboradores.map((c, idx) => {
      const bruto = parseFloat(c.valor_bruto) || 0;
      const liquido = parseFloat(c.valor_liquido) || 0;
      const desc = bruto - liquido;

      if (temTaxa) {
        return [
          String(idx + 1),
          c.nome || '-',
          formatarCPF(c.cpf),
          formatarMoeda(bruto),
          desc > 0 ? `- ${formatarMoeda(desc)}` : '-',
          formatarMoeda(liquido)
        ];
      }
      return [
        String(idx + 1),
        c.nome || '-',
        formatarCPF(c.cpf),
        formatarMoeda(liquido)
      ];
    });

    const footRow = temTaxa
      ? ['', '', 'TOTAIS', formatarMoeda(valorBruto), `- ${formatarMoeda(totalDesconto)}`, formatarMoeda(valorLiquido)]
      : ['', '', 'TOTAIS', formatarMoeda(valorLiquido)];

    const colStyles = temTaxa
      ? {
          0: { halign: 'center', cellWidth: 30 },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 100 },
          3: { halign: 'right', cellWidth: 90 },
          4: { halign: 'right', cellWidth: 80 },
          5: { halign: 'right', cellWidth: 90 }
        }
      : {
          0: { halign: 'center', cellWidth: 30 },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 120 },
          3: { halign: 'right', cellWidth: 110 }
        };

    doc.autoTable({
      startY: y,
      head: [headRow],
      body: bodyRows,
      foot: [footRow],
      theme: 'grid',
      styles: {
        fontSize: 9,
        cellPadding: 7,
        lineColor: [229, 231, 235],
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: CORES.roxo,
        textColor: CORES.branco,
        fontStyle: 'bold',
        fontSize: 9,
        halign: 'center'
      },
      footStyles: {
        fillColor: CORES.cinzaClaro,
        textColor: CORES.roxo,
        fontStyle: 'bold',
        fontSize: 10,
      },
      columnStyles: colStyles,
      alternateRowStyles: { fillColor: [250, 250, 252] },
      margin: { left: 20, right: 20 }
    });
  } else {
    doc.setFontSize(10);
    doc.setTextColor(...CORES.cinzaMedio);
    doc.text('Nenhum colaborador nesta remessa.', 20, y);
  }

  adicionarFooter(doc);
  doc.save(`Relatorio_Remessa_${dados.remessa_id}.pdf`);
};
