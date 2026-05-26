/**
 * Service de Colaboradores
 * Lógica de negócio (validações, processamento)
 */

const colaboradoresRepository = require('../repositories/colaboradores.repository');
const { validatePagination, extractClienteId, isValidCPF, limparCPF, isValidEmail, isValidDate } = require('../utils/validators');
const { APIError } = require('../middlewares/errorHandler');
const { ok, created, paginated } = require('../utils/response');
const logger = require('../utils/logger');
const XLSX = require('xlsx');

// =============================================
// SERVIÇOS PARA TELA DE CRÉDITOS (existentes)
// =============================================

/**
 * Busca colaboradores ativos com filtros
 */
const listarColaboradores = async (query) => {
  const { clienteId, search = '', setorId, limit, offset } = query;

  if (!clienteId) {
    throw new APIError('cliente_id é obrigatório', 400, { campo: 'cliente_id' });
  }

  const { limit: validLimit, offset: validOffset } = validatePagination(limit, offset);

  try {
    const resultado = await colaboradoresRepository.buscarColaboradores(
      clienteId, search, setorId || null, validLimit, validOffset
    );

    logger.info('Colaboradores listados:', { clienteId, total: resultado.total });

    return paginated(resultado.colaboradores, {
      total: resultado.total,
      limit: validLimit,
      offset: validOffset
    });
  } catch (error) {
    logger.error('Erro ao listar colaboradores:', { error: error.message });
    throw new APIError('Erro ao buscar colaboradores', 500);
  }
};

/**
 * Busca setores/categorias de um cliente
 */
const obterSetores = async (clienteId) => {
  if (!clienteId) throw new APIError('cliente_id é obrigatório', 400);

  try {
    const setores = await colaboradoresRepository.buscarSetores(clienteId);
    return ok(setores);
  } catch (error) {
    logger.error('Erro ao obter setores:', { error: error.message });
    throw new APIError('Erro ao buscar setores', 500);
  }
};

/**
 * Processa upload e validação de arquivo Excel para créditos
 */
const processarExcel = async (file, clienteId) => {
  if (!file) throw new APIError('Arquivo não enviado', 400);
  if (!clienteId) throw new APIError('cliente_id é obrigatório', 400);

  try {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const dados = XLSX.utils.sheet_to_json(worksheet);

    if (dados.length === 0) throw new APIError('Arquivo Excel vazio', 400);
    if (dados.length > 5000) throw new APIError('Arquivo com mais de 5000 linhas', 413);

    const colaboradoresProcessados = [];
    const erros = [];

    dados.forEach((linha, index) => {
      const numLinha = index + 2;
      const nome = linha.nome ? String(linha.nome).trim() : null;
      // Excel pode interpretar CPF como número e remover zeros à esquerda
      let cpf = linha.cpf != null ? String(linha.cpf).trim().replace(/\D/g, '') : null;
      if (cpf && cpf.length > 0 && cpf.length < 11) cpf = cpf.padStart(11, '0');
      const valor = linha.valor ? parseFloat(linha.valor) : null;
      const categoria = linha.categoria ? String(linha.categoria).trim() : null;

      const validacoes = [];
      if (!nome || nome.length === 0) validacoes.push('Nome é obrigatório');
      else if (nome.length > 255) validacoes.push('Nome muito longo (máximo 255 caracteres)');
      if (!cpf) validacoes.push('CPF é obrigatório');
      else {
        const cpfLimpo = cpf.replace(/\D/g, '');
        if (cpfLimpo.length !== 11) validacoes.push('CPF deve ter 11 dígitos');
      }
      if (!valor || isNaN(valor) || valor <= 0) validacoes.push('Valor deve ser um número positivo');
      else if (valor > 1000000) validacoes.push('Valor não pode exceder R$ 1.000.000');

      if (validacoes.length > 0) {
        erros.push({ linha: numLinha, nome: nome || 'N/A', cpf, erros: validacoes });
      } else {
        colaboradoresProcessados.push({
          nome, cpf: cpf.replace(/\D/g, ''), valor, categoria: categoria || 'Sem categoria'
        });
      }
    });

    return ok({
      total_importados: colaboradoresProcessados.length,
      total_erros: erros.length,
      erros,
      colaboradores: colaboradoresProcessados
    });
  } catch (error) {
    if (error instanceof APIError) throw error;
    throw new APIError('Erro ao processar arquivo Excel', 400);
  }
};

/**
 * Gera planilha Excel padrão para importação de créditos
 */
const gerarPlanilhaPadrao = async (clienteId) => {
  if (!clienteId) throw new APIError('cliente_id é obrigatório', 400);

  try {
    const colaboradores = await colaboradoresRepository.buscarColaboradoresParaPlanilha(clienteId);
    if (colaboradores.length === 0) throw new APIError('Nenhum colaborador ativo encontrado', 404);

    const dadosPlanilha = colaboradores.map(c => ({ nome: c.nome, cpf: c.cpf, valor: '' }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dadosPlanilha);
    ws['!cols'] = [{ wch: 40 }, { wch: 16 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, 'ImportacaoRecarga');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  } catch (error) {
    if (error instanceof APIError) throw error;
    throw new APIError('Erro ao gerar planilha padrão', 500);
  }
};

/**
 * Busca taxa de manutenção do cliente
 */
const obterTaxaCliente = async (clienteId) => {
  if (!clienteId) throw new APIError('cliente_id é obrigatório', 400);

  try {
    const { taxa, tipo } = await colaboradoresRepository.buscarTaxaCliente(clienteId);
    return ok({ taxa, tipo });
  } catch (error) {
    logger.error('Erro ao obter taxa do cliente:', { error: error.message });
    throw new APIError('Erro ao buscar taxa do cliente', 500);
  }
};

/**
 * Gera planilha Excel padrão para importação de colaboradores (usuários)
 * Colunas: NOME, CPF, DATA_NASCIMENTO, SEXO, EMAIL, CELULAR
 */
const gerarPlanilhaUsuarios = async (clienteId) => {
  if (!clienteId) throw new APIError('cliente_id é obrigatório', 400);

  try {
    const dadosPlanilha = [
      { NOME: 'EXEMPLO FULANO DA SILVA', CPF: '00000000000', DATA_NASCIMENTO: '01/01/1990', SEXO: 'M', EMAIL: 'exemplo@email.com', CELULAR: '11999999999' }
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dadosPlanilha);
    ws['!cols'] = [{ wch: 40 }, { wch: 16 }, { wch: 18 }, { wch: 8 }, { wch: 30 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, 'ImportacaoColaboradores');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  } catch (error) {
    if (error instanceof APIError) throw error;
    throw new APIError('Erro ao gerar planilha de colaboradores', 500);
  }
};

// =============================================
// SERVIÇOS PARA TELA DE COLABORADORES (CRUD)
// =============================================

/**
 * Lista todos os colaboradores (ativos + bloqueados) para a gestão
 */
const listarTodosColaboradores = async (query) => {
  const { clienteId, search = '', limit = 100, offset = 0 } = query;
  if (!clienteId) throw new APIError('cliente_id é obrigatório', 400);

  try {
    const resultado = await colaboradoresRepository.buscarTodosColaboradores(
      clienteId, search, limit, offset
    );
    return paginated(resultado.colaboradores, {
      total: resultado.total,
      limit,
      offset
    });
  } catch (error) {
    logger.error('Erro ao listar todos colaboradores:', { error: error.message });
    throw new APIError('Erro ao buscar colaboradores', 500);
  }
};

/**
 * Obtém dados completos de um colaborador
 */
const obterColaboradorCompleto = async (userId, clienteId) => {
  if (!userId) throw new APIError('user_id é obrigatório', 400);
  if (!clienteId) throw new APIError('cliente_id é obrigatório', 400);

  try {
    const colaborador = await colaboradoresRepository.buscarColaboradorCompleto(userId, clienteId);
    if (!colaborador) throw new APIError('Colaborador não encontrado', 404);

    // Buscar categorias do junction table
    const categorias = await colaboradoresRepository.buscarCategoriasDoUsuario(userId);
    colaborador.categorias = categorias;

    return ok(colaborador);
  } catch (error) {
    if (error instanceof APIError) throw error;
    throw new APIError('Erro ao buscar colaborador', 500);
  }
};

/**
 * Cria um novo colaborador
 */
const criarColaborador = async (dados) => {
  // Validações obrigatórias
  if (!dados.nome || dados.nome.trim().length === 0)
    throw new APIError('Nome é obrigatório', 400);
  if (!dados.cpf || dados.cpf.trim().length === 0)
    throw new APIError('CPF é obrigatório', 400);
  if (!dados.cliente_id)
    throw new APIError('cliente_id é obrigatório', 400);

  // Validação de CPF com dígitos verificadores
  if (!isValidCPF(dados.cpf))
    throw new APIError('CPF inválido', 400);

  // Validação de email (se informado)
  if (dados.email && dados.email.trim().length > 0) {
    if (!isValidEmail(dados.email.trim()))
      throw new APIError('Email inválido', 400);
  }

  // Validação de data de nascimento (deve ser anterior a hoje)
  if (dados.nascimento && dados.nascimento.trim().length > 0) {
    if (!isValidDate(dados.nascimento))
      throw new APIError('Data de nascimento inválida ou no futuro', 400);
  }

  // Limpar CPF — gravar SEM máscara
  const cpfLimpo = limparCPF(dados.cpf);

  try {
    const resultado = await colaboradoresRepository.criarColaborador({
      ...dados,
      cpf: cpfLimpo,
      nome: dados.nome.trim().toUpperCase(),
      email: dados.email ? dados.email.trim().toLowerCase() : ''
    });

    // Vincular categorias via junction table
    if (dados.categorias && dados.categorias.length > 0) {
      await colaboradoresRepository.vincularCategorias(resultado.id, dados.categorias);
    }

    logger.info('Colaborador criado:', { id: resultado.id, nome: dados.nome });
    return created(resultado);
  } catch (error) {
    if (error.code === '23505') {
      throw new APIError('CPF já cadastrado para este cliente', 409);
    }
    logger.error('Erro ao criar colaborador:', { error: error.message });
    throw new APIError('Erro ao criar colaborador', 500);
  }
};

/**
 * Atualiza um colaborador existente
 */
const atualizarColaborador = async (userId, clienteId, dados) => {
  if (!userId) throw new APIError('user_id é obrigatório', 400);
  if (!clienteId) throw new APIError('cliente_id é obrigatório', 400);
  if (!dados.nome || dados.nome.trim().length === 0)
    throw new APIError('Nome é obrigatório', 400);

  // Validação de CPF (se informado)
  if (dados.cpf && dados.cpf.trim().length > 0) {
    if (!isValidCPF(dados.cpf))
      throw new APIError('CPF inválido', 400);
  }

  // Validação de email (se informado)
  if (dados.email && dados.email.trim().length > 0) {
    if (!isValidEmail(dados.email.trim()))
      throw new APIError('Email inválido', 400);
  }

  // Validação de data de nascimento
  if (dados.nascimento && dados.nascimento.trim().length > 0) {
    if (!isValidDate(dados.nascimento))
      throw new APIError('Data de nascimento inválida ou no futuro', 400);
  }

  try {
    const resultado = await colaboradoresRepository.atualizarColaborador(userId, clienteId, {
      ...dados,
      cpf: dados.cpf ? limparCPF(dados.cpf) : dados.cpf,
      nome: dados.nome.trim().toUpperCase(),
      email: dados.email ? dados.email.trim().toLowerCase() : dados.email
    });

    if (!resultado) throw new APIError('Colaborador não encontrado', 404);

    // Sincronizar categorias: remove todas e re-insere
    if (dados.categorias !== undefined) {
      // Buscar categorias antigas antes de desvincular
      const categoriasAntigas = await colaboradoresRepository.buscarCategoriasDoUsuario(userId);
      const idsAntigos = categoriasAntigas.map(c => c.id);
      const idsNovos = dados.categorias || [];

      await colaboradoresRepository.desvincularTodasCategorias(userId);
      if (idsNovos.length > 0) {
        await colaboradoresRepository.vincularCategorias(userId, idsNovos);
      }

      // Verificar categorias removidas — se ficaram órfãs, deletar do sistema
      const removidas = idsAntigos.filter(id => !idsNovos.includes(id));
      for (const catId of removidas) {
        const vinculos = await colaboradoresRepository.contarVinculosCategoria(catId);
        if (vinculos === 0) {
          await colaboradoresRepository.deletarCategoria(catId, clienteId);
          logger.info('Categoria órfã deletada automaticamente:', { id: catId });
        }
      }
    }

    logger.info('Colaborador atualizado:', { id: userId });
    return ok(resultado);
  } catch (error) {
    if (error instanceof APIError) throw error;
    throw new APIError('Erro ao atualizar colaborador', 500);
  }
};

/**
 * Altera situação (Ativar/Bloquear)
 */
const alterarSituacao = async (userId, clienteId, novaSituacaoId) => {
  if (!userId) throw new APIError('user_id é obrigatório', 400);
  if (!clienteId) throw new APIError('cliente_id é obrigatório', 400);
  if (!novaSituacaoId) throw new APIError('situacao_id é obrigatório', 400);

  try {
    const resultado = await colaboradoresRepository.alterarSituacao(userId, clienteId, novaSituacaoId);
    if (!resultado) throw new APIError('Colaborador não encontrado', 404);

    logger.info('Situação alterada:', { id: userId, novaSituacao: novaSituacaoId });
    return ok(resultado);
  } catch (error) {
    if (error instanceof APIError) throw error;
    throw new APIError('Erro ao alterar situação', 500);
  }
};

/**
 * Busca restaurantes filtrados por cliente
 */
const obterRestaurantes = async (clienteId) => {
  if (!clienteId) throw new APIError('cliente_id é obrigatório', 400);
  try {
    const restaurantes = await colaboradoresRepository.buscarRestaurantes(clienteId);
    return ok(restaurantes);
  } catch (error) {
    throw new APIError('Erro ao buscar restaurantes', 500);
  }
};

/**
 * Processa Excel para importação de colaboradores (usuários)
 */
const processarExcelUsuarios = async (file, clienteId) => {
  if (!file) throw new APIError('Arquivo não enviado', 400);
  if (!clienteId) throw new APIError('cliente_id é obrigatório', 400);

  try {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const dados = XLSX.utils.sheet_to_json(worksheet);

    if (dados.length === 0) throw new APIError('Arquivo Excel vazio', 400);
    if (dados.length > 5000) throw new APIError('Arquivo com mais de 5000 linhas', 413);

    const validos = [];
    const erros = [];

    dados.forEach((linha, index) => {
      const numLinha = index + 2;

      // Aceita cabeçalhos em português ou inglês
      const nome = (linha.NOME || linha.nome || linha.Nome || '').toString().trim();
      // Excel pode interpretar CPF como número e remover zeros à esquerda
      let cpfRaw = linha.CPF ?? linha.cpf ?? linha.Cpf ?? '';
      let cpf = String(cpfRaw).trim().replace(/\D/g, '');
      if (cpf.length > 0 && cpf.length < 11) cpf = cpf.padStart(11, '0');
      const dataNascRaw = linha.DATA_NASCIMENTO ?? linha.data_nascimento ?? linha['Data Nascimento'] ?? linha['data nascimento'] ?? '';
      let dataNascimento = '';
      if (typeof dataNascRaw === 'number') {
        // Excel armazena datas como número serial — converter para yyyy-mm-dd
        const excelEpoch = new Date(1899, 11, 30);
        const dt = new Date(excelEpoch.getTime() + dataNascRaw * 86400000);
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        dataNascimento = `${y}-${m}-${d}`;
      } else {
        dataNascimento = String(dataNascRaw).trim();
      }
      const sexo = (linha.SEXO || linha.sexo || linha.Sexo || '').toString().trim().toUpperCase();
      const email = (linha.EMAIL || linha.email || linha.Email || '').toString().trim();
      const celular = (linha.CELULAR || linha.celular || linha.Celular || '').toString().trim();

      const validacoes = [];
      if (!nome) validacoes.push('Nome é obrigatório');

      // Validação de CPF com dígitos verificadores
      if (!cpf) {
        validacoes.push('CPF é obrigatório');
      } else if (!isValidCPF(cpf)) {
        validacoes.push('CPF inválido (verifique os dígitos)');
      }

      // Validação de data de nascimento (deve ser anterior a hoje)
      if (dataNascimento) {
        // Normalizar para yyyy-mm-dd
        let dataFormatada = dataNascimento;
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(dataNascimento)) {
          const [dia, mes, ano] = dataNascimento.split('/');
          dataFormatada = `${ano}-${mes}-${dia}`;
        } else if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(dataNascimento)) {
          // Formato com dígitos variáveis (ex: 1/7/92)
          const partes = dataNascimento.split('/');
          const dia = partes[0].padStart(2, '0');
          const mes = partes[1].padStart(2, '0');
          let ano = partes[2];
          if (ano.length === 2) ano = (parseInt(ano) > 50 ? '19' : '20') + ano;
          dataFormatada = `${ano}-${mes}-${dia}`;
        }
        if (!isValidDate(dataFormatada)) {
          validacoes.push('Data de nascimento inválida ou no futuro');
        }
      }

      // Validação de email
      if (email && !isValidEmail(email)) {
        validacoes.push('Email inválido');
      }

      if (sexo && sexo !== 'M' && sexo !== 'F') validacoes.push('Sexo deve ser M ou F');

      if (validacoes.length > 0) {
        erros.push({ linha: numLinha, nome: nome || 'N/A', cpf, erros: validacoes });
      } else {
        // Gravar CPF sem máscara e normalizar data para yyyy-mm-dd
        let nascimentoNorm = dataNascimento || null;
        if (nascimentoNorm) {
          if (/^\d{2}\/\d{2}\/\d{4}$/.test(nascimentoNorm)) {
            const [dia, mes, ano] = nascimentoNorm.split('/');
            nascimentoNorm = `${ano}-${mes}-${dia}`;
          } else if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(nascimentoNorm)) {
            const partes = nascimentoNorm.split('/');
            const dia = partes[0].padStart(2, '0');
            const mes = partes[1].padStart(2, '0');
            let ano = partes[2];
            if (ano.length === 2) ano = (parseInt(ano) > 50 ? '19' : '20') + ano;
            nascimentoNorm = `${ano}-${mes}-${dia}`;
          }
          // Se já é yyyy-mm-dd (convertido de serial Excel), manter
        }
        validos.push({
          nome: nome.toUpperCase(),
          cpf: limparCPF(cpf),
          nascimento: nascimentoNorm,
          sexo: sexo || null,
          email: email ? email.trim().toLowerCase() : '',
          celular: celular ? celular.replace(/\D/g, '') : ''
        });
      }
    });

    // Inserir válidos no banco
    let resultadosInsercao = [];
    if (validos.length > 0) {
      resultadosInsercao = await colaboradoresRepository.importarColaboradoresEmLote(validos, clienteId);
    }

    const criados = resultadosInsercao.filter(r => r.status === 'criado').length;
    const existentes = resultadosInsercao.filter(r => r.status === 'existente').length;

    logger.info('Importação de usuários processada:', {
      clienteId, totalLinhas: dados.length,
      criados, existentes, erros: erros.length
    });

    return ok({
      total_linhas: dados.length,
      criados,
      existentes,
      total_erros: erros.length,
      erros,
      resultados: resultadosInsercao
    });
  } catch (error) {
    if (error instanceof APIError) throw error;
    logger.error('Erro ao processar Excel de usuários:', { error: error.message });
    throw new APIError('Erro ao processar arquivo Excel', 400);
  }
};

/**
 * Cria nova categoria para o cliente
 */
const criarCategoria = async (clienteId, nome) => {
  if (!clienteId) throw new APIError('cliente_id é obrigatório', 400);
  if (!nome || nome.trim().length === 0) throw new APIError('Nome da categoria é obrigatório', 400);

  try {
    const resultado = await colaboradoresRepository.criarCategoria(clienteId, nome.trim());
    logger.info('Categoria criada:', { id: resultado.id, nome: resultado.nome, clienteId });
    return created(resultado);
  } catch (error) {
    logger.error('Erro ao criar categoria:', { error: error.message });
    throw new APIError('Erro ao criar categoria', 500);
  }
};

/**
 * Deleta uma categoria do sistema
 */
const deletarCategoria = async (categoriaId, clienteId) => {
  if (!categoriaId) throw new APIError('categoria_id é obrigatório', 400);
  if (!clienteId) throw new APIError('cliente_id é obrigatório', 400);

  try {
    const resultado = await colaboradoresRepository.deletarCategoria(parseInt(categoriaId), clienteId);
    if (!resultado) throw new APIError('Categoria não encontrada', 404);

    logger.info('Categoria deletada:', { id: categoriaId, clienteId });
    return ok(resultado);
  } catch (error) {
    if (error instanceof APIError) throw error;
    logger.error('Erro ao deletar categoria:', { error: error.message });
    throw new APIError('Erro ao deletar categoria', 500);
  }
};

module.exports = {
  // Créditos (existentes)
  listarColaboradores,
  obterSetores,
  processarExcel,
  gerarPlanilhaPadrao,
  gerarPlanilhaUsuarios,
  obterTaxaCliente,
  // CRUD Colaboradores (novos)
  listarTodosColaboradores,
  obterColaboradorCompleto,
  criarColaborador,
  atualizarColaborador,
  alterarSituacao,
  obterRestaurantes,
  processarExcelUsuarios,
  // Categorias
  criarCategoria,
  deletarCategoria
};
