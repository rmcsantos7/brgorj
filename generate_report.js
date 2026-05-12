const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat,
  TableOfContents, HeadingLevel, BorderStyle, WidthType, ShadingType,
  PageNumber, PageBreak
} = require("docx");

// Brand colors
const ROXO = "4A1D4F";
const ROSA = "F9678C";
const CINZA_CLARO = "F3F4F6";
const CINZA_MEDIO = "6B7280";
const BRANCO = "FFFFFF";

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const noBorders = {
  top: { style: BorderStyle.NONE, size: 0 },
  bottom: { style: BorderStyle.NONE, size: 0 },
  left: { style: BorderStyle.NONE, size: 0 },
  right: { style: BorderStyle.NONE, size: 0 },
};
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

// Page dimensions (A4)
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN = 1440;
const CONTENT_W = PAGE_W - 2 * MARGIN;

function makeHeaderCell(text, width) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: ROXO, type: ShadingType.CLEAR },
    margins: cellMargins,
    verticalAlign: "center",
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: BRANCO, font: "Arial", size: 18 })] })],
  });
}

function makeCell(text, width, opts = {}) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: opts.shading ? { fill: opts.shading, type: ShadingType.CLEAR } : undefined,
    margins: cellMargins,
    verticalAlign: "center",
    children: [new Paragraph({
      alignment: opts.align || AlignmentType.LEFT,
      children: [new TextRun({ text, font: "Arial", size: 18, bold: opts.bold, color: opts.color })]
    })],
  });
}

function sectionTitle(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun(text)],
    spacing: { before: 360, after: 200 },
  });
}

function subTitle(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun(text)],
    spacing: { before: 240, after: 160 },
  });
}

function bodyText(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.noSpacing ? 40 : 120 },
    children: [new TextRun({ text, font: "Arial", size: 20, ...(opts.bold && { bold: true }), ...(opts.color && { color: opts.color }) })],
  });
}

function codeBlock(lines) {
  return lines.map(line =>
    new Paragraph({
      spacing: { after: 0 },
      children: [new TextRun({ text: line, font: "Consolas", size: 16, color: "333333" })],
    })
  );
}

// ==================== ENDPOINTS TABLE ====================
const endpoints = [
  ["POST", "/api/auth/login", "N\u00e3o", "-", "Login do usu\u00e1rio"],
  ["GET", "/api/auth/me", "JWT", "-", "Dados do usu\u00e1rio logado"],
  ["POST", "/api/auth/recuperar-senha", "N\u00e3o", "-", "Recupera\u00e7\u00e3o de senha por email"],
  ["POST", "/api/auth/trocar-senha", "JWT", "-", "Altera\u00e7\u00e3o de senha"],
  ["GET", "/api/colaboradores", "JWT", "Sim", "Lista colaboradores ativos"],
  ["GET", "/api/colaboradores/todos", "JWT", "Sim", "Lista todos os colaboradores"],
  ["GET", "/api/colaboradores/:id", "JWT", "Sim", "Detalhes de um colaborador"],
  ["POST", "/api/colaboradores/criar", "JWT", "Sim", "Cadastrar novo colaborador"],
  ["PUT", "/api/colaboradores/:id", "JWT", "Sim", "Atualizar colaborador"],
  ["PATCH", "/api/colaboradores/:id/situacao", "JWT", "Sim", "Ativar/bloquear colaborador"],
  ["GET", "/api/colaboradores/setores", "JWT", "Sim", "Listar categorias"],
  ["GET", "/api/colaboradores/planilha", "JWT", "Sim", "Download template Excel"],
  ["POST", "/api/colaboradores/import", "JWT", "Sim", "Importar via Excel"],
  ["GET", "/api/colaboradores/taxa", "JWT", "Sim", "Taxa do conv\u00eanio"],
  ["POST", "/api/creditos/gerar", "JWT", "Sim", "Gerar remessa de cr\u00e9ditos"],
  ["GET", "/api/creditos/historico", "JWT", "Sim", "Hist\u00f3rico de remessas"],
  ["GET", "/api/creditos/remessa/:id", "JWT", "Sim", "Detalhe de uma remessa"],
  ["GET", "/api/dashboard", "JWT", "Sim", "Dados do dashboard"],
  ["GET", "/api/relatorios/*", "JWT", "Sim", "Dados para relat\u00f3rios PDF"],
  ["GET", "/health", "N\u00e3o", "-", "Health check"],
];

const colWidths5 = [900, 2800, 1100, 1100, 3126];

function endpointsTable() {
  const headerRow = new TableRow({
    children: [
      makeHeaderCell("M\u00e9todo", colWidths5[0]),
      makeHeaderCell("Rota", colWidths5[1]),
      makeHeaderCell("Auth", colWidths5[2]),
      makeHeaderCell("Tenant", colWidths5[3]),
      makeHeaderCell("Descri\u00e7\u00e3o", colWidths5[4]),
    ],
  });
  const rows = endpoints.map((row, i) =>
    new TableRow({
      children: row.map((cell, j) =>
        makeCell(cell, colWidths5[j], {
          shading: i % 2 === 0 ? CINZA_CLARO : undefined,
          bold: j === 0,
          color: j === 0 ? ROXO : undefined,
        })
      ),
    })
  );
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: colWidths5,
    rows: [headerRow, ...rows],
  });
}

// ==================== DEPS TABLES ====================
function depsTable(deps) {
  const cw = [2500, 1500, 5026];
  const header = new TableRow({
    children: [makeHeaderCell("Pacote", cw[0]), makeHeaderCell("Vers\u00e3o", cw[1]), makeHeaderCell("Finalidade", cw[2])],
  });
  const rows = deps.map((d, i) =>
    new TableRow({
      children: [
        makeCell(d[0], cw[0], { bold: true, shading: i % 2 === 0 ? CINZA_CLARO : undefined }),
        makeCell(d[1], cw[1], { shading: i % 2 === 0 ? CINZA_CLARO : undefined }),
        makeCell(d[2], cw[2], { shading: i % 2 === 0 ? CINZA_CLARO : undefined }),
      ],
    })
  );
  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: cw, rows: [header, ...rows] });
}

const backendDeps = [
  ["express", "^4.18.2", "Framework HTTP"],
  ["pg", "^8.11.3", "Driver PostgreSQL"],
  ["jsonwebtoken", "^9.0.3", "Gera\u00e7\u00e3o/valida\u00e7\u00e3o JWT"],
  ["bcrypt", "^5.1.1", "Hash de senhas (dispon\u00edvel)"],
  ["helmet", "^7.1.0", "Headers de seguran\u00e7a"],
  ["cors", "^2.8.5", "Controle de CORS"],
  ["express-rate-limit", "^7.1.5", "Rate limiting"],
  ["dotenv", "^16.3.1", "Vari\u00e1veis de ambiente"],
  ["morgan", "^1.10.0", "Logging HTTP"],
  ["multer", "^1.4.5-lts.1", "Upload de arquivos"],
  ["xlsx", "^0.18.5", "Processamento de planilhas"],
  ["nodemailer", "^6.9.8", "Envio de emails"],
  ["jest", "^29.7.0", "Framework de testes"],
  ["supertest", "^6.3.3", "Testes HTTP"],
];

const frontendDeps = [
  ["react", "^18.2.0", "Framework UI"],
  ["react-dom", "^18.2.0", "Renderiza\u00e7\u00e3o DOM"],
  ["react-router-dom", "^6.20.0", "Roteamento SPA"],
  ["axios", "^1.6.2", "Cliente HTTP"],
  ["chart.js", "^4.4.1", "Gr\u00e1ficos interativos"],
  ["jspdf", "^2.5.1", "Gera\u00e7\u00e3o de PDFs"],
  ["jspdf-autotable", "^3.8.2", "Tabelas em PDFs"],
];

// ==================== TABELAS BANCO ====================
const tabelas = [
  ["crd_cliente", "Dados das empresas (nome fantasia, CNPJ)"],
  ["crd_usuario", "Colaboradores (nome, CPF, celular, situa\u00e7\u00e3o)"],
  ["crd_usuario_credito", "Cr\u00e9ditos individuais (valor, data, remessa)"],
  ["crd_usuario_credito_remessa", "Lotes de cr\u00e9ditos (data, login, t\u00edtulo)"],
  ["crd_situacao", "Mapeamento de status (1=ATIVO, outros=BLOQUEADO)"],
  ["crd_cliente_setor", "Categorias/setores dos colaboradores"],
  ["pgt_categoria_de_colaborador", "Associa\u00e7\u00e3o colaborador-setor"],
  ["crd_dados_sensiveis", "Configura\u00e7\u00e3o SMTP para emails"],
];

function tabelasBanco() {
  const cw = [3500, 5526];
  const header = new TableRow({
    children: [makeHeaderCell("Tabela", cw[0]), makeHeaderCell("Descri\u00e7\u00e3o", cw[1])],
  });
  const rows = tabelas.map((d, i) =>
    new TableRow({
      children: [
        makeCell(d[0], cw[0], { bold: true, shading: i % 2 === 0 ? CINZA_CLARO : undefined }),
        makeCell(d[1], cw[1], { shading: i % 2 === 0 ? CINZA_CLARO : undefined }),
      ],
    })
  );
  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: cw, rows: [header, ...rows] });
}

// ==================== BUILD DOCUMENT ====================
const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 20 } } },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: ROXO },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ROSA, space: 4 } } },
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: ROXO },
        paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 1 },
      },
      {
        id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 22, bold: true, font: "Arial", color: "333333" },
        paragraph: { spacing: { before: 180, after: 120 }, outlineLevel: 2 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      },
      {
        reference: "numbers",
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      },
      {
        reference: "checklist",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "\u2610", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      },
    ],
  },
  sections: [
    // ==================== COVER PAGE ====================
    {
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      children: [
        new Paragraph({ spacing: { before: 3000 } }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: "CONFIDENCIAL", font: "Arial", size: 20, bold: true, color: ROSA })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: ROXO, space: 12 } },
          children: [new TextRun({ text: "Relat\u00f3rio T\u00e9cnico de", font: "Arial", size: 48, color: ROXO })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [new TextRun({ text: "Arquitetura e Seguran\u00e7a", font: "Arial", size: 48, bold: true, color: ROXO })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({ text: "Plataforma BR Gorjeta", font: "Arial", size: 28, color: ROSA })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 600 },
          children: [new TextRun({ text: "Portal de Gest\u00e3o de Gorjetas", font: "Arial", size: 24, color: CINZA_MEDIO })],
        }),
        new Paragraph({ spacing: { before: 1200 } }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Mar\u00e7o 2026", font: "Arial", size: 22, color: CINZA_MEDIO })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({ text: "Vers\u00e3o 1.0", font: "Arial", size: 20, color: CINZA_MEDIO })],
        }),
      ],
    },
    // ==================== TOC ====================
    {
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: "BR Gorjeta - Relat\u00f3rio T\u00e9cnico", font: "Arial", size: 16, color: CINZA_MEDIO, italics: true })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            border: { top: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD", space: 4 } },
            children: [
              new TextRun({ text: "P\u00e1gina ", font: "Arial", size: 16, color: CINZA_MEDIO }),
              new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: CINZA_MEDIO }),
              new TextRun({ text: "  |  Confidencial", font: "Arial", size: 16, color: CINZA_MEDIO }),
            ],
          })],
        }),
      },
      children: [
        sectionTitle("\u00cdndice"),
        new TableOfContents("Sum\u00e1rio", { hyperlink: true, headingStyleRange: "1-3" }),
        new Paragraph({ children: [new PageBreak()] }),

        // ==================== SECTION 1 ====================
        sectionTitle("1. Vis\u00e3o Geral da Plataforma"),
        bodyText("A plataforma BR Gorjeta \u00e9 um sistema web de gest\u00e3o de gorjetas para empresas do setor de hospitalidade. Permite cadastro de colaboradores, gera\u00e7\u00e3o de recargas (cr\u00e9ditos), relat\u00f3rios em PDF e dashboard anal\u00edtico."),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Arquitetura: SPA (Single Page Application) + REST API", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Frontend: React 18.2 hospedado como SPA", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Backend: Node.js com Express 4.18", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Banco de Dados: PostgreSQL com connection pooling (20 conex\u00f5es max)", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 200 }, children: [new TextRun({ text: "Comunica\u00e7\u00e3o: HTTPS (em produ\u00e7\u00e3o), JSON, JWT Bearer tokens", font: "Arial", size: 20 })] }),

        // ==================== SECTION 2 ====================
        new Paragraph({ children: [new PageBreak()] }),
        sectionTitle("2. Arquitetura de Software"),
        subTitle("2.1 Padr\u00e3o Arquitetural"),
        bodyText("O backend segue o padr\u00e3o MVC em camadas com separa\u00e7\u00e3o clara de responsabilidades:"),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Controllers: recebem requisi\u00e7\u00f5es HTTP, delegam para services", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Services: l\u00f3gica de neg\u00f3cio, valida\u00e7\u00e3o, transforma\u00e7\u00e3o de dados", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Repositories: isolam queries SQL (Repository Pattern)", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Middlewares: autentica\u00e7\u00e3o JWT, verifica\u00e7\u00e3o multi-tenant, upload, rate limiting, error handling", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 200 }, children: [new TextRun({ text: "Frontend: component-based architecture com React Context API para estado global", font: "Arial", size: 20 })] }),

        subTitle("2.2 Estrutura de Diret\u00f3rios Backend"),
        ...codeBlock([
          "api/src/",
          "  config/         \u2192 Configura\u00e7\u00e3o do banco de dados (pool PostgreSQL)",
          "  controllers/    \u2192 Handlers HTTP (auth, colaboradores, creditos, dashboard, relatorios)",
          "  middlewares/     \u2192 Auth JWT, verifica\u00e7\u00e3o clienteId, upload, errorHandler",
          "  repositories/   \u2192 Queries SQL parametrizadas",
          "  routes/         \u2192 Defini\u00e7\u00e3o de rotas Express",
          "  services/       \u2192 Regras de neg\u00f3cio e valida\u00e7\u00e3o",
          "  utils/          \u2192 Validators, logger, constants",
        ]),

        subTitle("2.3 Estrutura de Diret\u00f3rios Frontend"),
        ...codeBlock([
          "frontend/src/",
          "  components/     \u2192 Componentes reutiliz\u00e1veis (Layout, Tables, Forms)",
          "  contexts/       \u2192 AuthContext (estado global de autentica\u00e7\u00e3o)",
          "  hooks/          \u2192 Custom hooks (useCredito, useFetchColaboradores)",
          "  pages/          \u2192 P\u00e1ginas (Dashboard, Login, Colaboradores, Credito, Relatorios)",
          "  services/       \u2192 Camada HTTP (Axios com interceptors)",
          "  utils/          \u2192 Formatadores, gerador de PDF, logo base64",
        ]),

        // ==================== SECTION 3 ====================
        new Paragraph({ children: [new PageBreak()] }),
        sectionTitle("3. Autentica\u00e7\u00e3o e Autoriza\u00e7\u00e3o"),
        subTitle("3.1 Fluxo de Autentica\u00e7\u00e3o"),
        new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Usu\u00e1rio envia login + senha via POST /api/auth/login", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Backend busca usu\u00e1rio por login (case-insensitive)", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Senha verificada via hash MD5(usr_codigo + senha) \u2014 padr\u00e3o legado", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Se v\u00e1lida, gera JWT assinado com JWT_SECRET (obrigat\u00f3rio em env)", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Token armazenado em sessionStorage (padr\u00e3o) ou localStorage (lembrar-me)", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Requisi\u00e7\u00f5es subsequentes incluem header Authorization: Bearer {token}", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "numbers", level: 0 }, spacing: { after: 200 }, children: [new TextRun({ text: "Middleware auth.js verifica assinatura e expira\u00e7\u00e3o do token", font: "Arial", size: 20 })] }),

        subTitle("3.2 JWT Token"),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Algoritmo: HS256", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Expira\u00e7\u00e3o: configur\u00e1vel via JWT_EXPIRES_IN (padr\u00e3o: 24h)", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Payload: usr_codigo, usr_login, usr_nome, crd_cli_id, cliente_nome, cliente_cnpj, usr_administrador, senha_temporaria", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 200 }, children: [new TextRun({ text: "Secret: JWT_SECRET obrigat\u00f3rio \u2014 servidor n\u00e3o inicia sem ele", font: "Arial", size: 20 })] }),

        subTitle("3.3 Multi-Tenancy"),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Middleware verificarClienteId.js compara cliente_id da requisi\u00e7\u00e3o com o do token JWT", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Administradores podem acessar dados de qualquer cliente", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Usu\u00e1rios comuns s\u00f3 acessam dados do seu pr\u00f3prio cliente", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 200 }, children: [new TextRun({ text: "Tentativas n\u00e3o autorizadas s\u00e3o logadas com n\u00edvel WARN", font: "Arial", size: 20 })] }),

        subTitle("3.4 Recupera\u00e7\u00e3o de Senha"),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Gera senha tempor\u00e1ria de 8 caracteres (alfanum\u00e9rico, exclui caracteres amb\u00edguos)", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Salva hash MD5 + marca flag usr_senha_temporaria = true", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Envia email via SMTP (config na tabela crd_dados_sensiveis)", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Mensagem gen\u00e9rica retornada (previne enumera\u00e7\u00e3o de emails)", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 200 }, children: [new TextRun({ text: "Rate limit: 3 tentativas a cada 15 minutos", font: "Arial", size: 20 })] }),

        subTitle("3.5 Troca de Senha"),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "POST /api/auth/trocar-senha (requer autentica\u00e7\u00e3o)", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Valida senha atual via MD5, nova senha m\u00ednimo 6 caracteres", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Atualiza hash e limpa flag de senha tempor\u00e1ria", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 200 }, children: [new TextRun({ text: "Gera novo JWT sem flag senha_temporaria", font: "Arial", size: 20 })] }),

        // ==================== SECTION 4 ====================
        new Paragraph({ children: [new PageBreak()] }),
        sectionTitle("4. Seguran\u00e7a da Aplica\u00e7\u00e3o"),

        subTitle("4.1 Headers de Seguran\u00e7a (Helmet.js)"),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Content-Security-Policy: restringe scripts, estilos e conex\u00f5es a 'self'", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "X-Content-Type-Options: nosniff", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "X-Frame-Options: DENY", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "X-XSS-Protection: habilitado", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 200 }, children: [new TextRun({ text: "Strict-Transport-Security: habilitado em produ\u00e7\u00e3o", font: "Arial", size: 20 })] }),

        subTitle("4.2 Rate Limiting"),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Global: 200 requisi\u00e7\u00f5es/minuto por IP", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Login: 15 tentativas a cada 15 minutos por IP", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 200 }, children: [new TextRun({ text: "Recupera\u00e7\u00e3o de senha: 3 tentativas a cada 15 minutos por IP", font: "Arial", size: 20 })] }),

        subTitle("4.3 CORS"),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Produ\u00e7\u00e3o: whitelist configur\u00e1vel via CORS_ORIGIN (env)", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Desenvolvimento: aceita qualquer origem", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 200 }, children: [new TextRun({ text: "Credentials: habilitado para envio de cookies/tokens", font: "Arial", size: 20 })] }),

        subTitle("4.4 Valida\u00e7\u00e3o de Entrada"),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "CPF: algoritmo completo de d\u00edgitos verificadores (m\u00f3dulo 11)", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Email: regex padr\u00e3o", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "N\u00fameros: valida\u00e7\u00e3o de faixa (positivo, m\u00e1ximo 1.000.000)", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Strings: trim, truncate a 255 caracteres", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Datas: formato YYYY-MM-DD, rejeita datas futuras", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 200 }, children: [new TextRun({ text: "Pagina\u00e7\u00e3o: limites enfor\u00e7ados (1-500, offset >= 0)", font: "Arial", size: 20 })] }),

        subTitle("4.5 Upload de Arquivos"),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Armazenamento: em mem\u00f3ria (buffer, sem persist\u00eancia em disco)", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Limite: 10MB por arquivo, 1 arquivo por requisi\u00e7\u00e3o", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Tipos permitidos: .xlsx e .xls apenas", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Valida\u00e7\u00e3o dupla: MIME type + magic numbers", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 200 }, children: [new TextRun({ text: "Rejeita arquivos que n\u00e3o correspondem \u00e0 extens\u00e3o declarada", font: "Arial", size: 20 })] }),

        subTitle("4.6 Prote\u00e7\u00e3o contra SQL Injection"),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Todas as queries utilizam prepared statements com placeholders ($1, $2, $3...)", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Nenhuma concatena\u00e7\u00e3o de strings em queries SQL", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 200 }, children: [new TextRun({ text: "Biblioteca pg (node-postgres) com parametriza\u00e7\u00e3o nativa", font: "Arial", size: 20 })] }),

        subTitle("4.7 Tratamento de Erros"),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Classe APIError customizada com statusCode, message, details, timestamp", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Handler centralizado no middleware errorHandler.js", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Erros gen\u00e9ricos retornados ao cliente (sem stack traces)", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 200 }, children: [new TextRun({ text: "asyncHandler wrapper previne rejei\u00e7\u00f5es n\u00e3o capturadas", font: "Arial", size: 20 })] }),

        // ==================== SECTION 5 ====================
        new Paragraph({ children: [new PageBreak()] }),
        sectionTitle("5. Chamadas de API (Endpoints)"),
        bodyText("Tabela completa de endpoints da API REST com informa\u00e7\u00f5es de autentica\u00e7\u00e3o e multi-tenancy:"),
        endpointsTable(),

        // ==================== SECTION 6 ====================
        new Paragraph({ children: [new PageBreak()] }),
        sectionTitle("6. Conex\u00e3o com Banco de Dados"),
        subTitle("6.1 Configura\u00e7\u00e3o"),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Driver: pg (node-postgres) v8.11.3", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Pool: m\u00e1ximo 20 conex\u00f5es simult\u00e2neas", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Idle timeout: 30 segundos", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Connection timeout: 2 segundos", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 200 }, children: [new TextRun({ text: "SSL: habilitado em produ\u00e7\u00e3o (rejectUnauthorized: false)", font: "Arial", size: 20 })] }),

        subTitle("6.2 Vari\u00e1veis de Ambiente"),
        ...codeBlock([
          "DB_HOST     (padr\u00e3o: localhost)",
          "DB_PORT     (padr\u00e3o: 5432)",
          "DB_USER     (padr\u00e3o: postgres)",
          "DB_PASSWORD",
          "DB_NAME",
        ]),

        subTitle("6.3 Padr\u00e3o de Queries"),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Todas as queries s\u00e3o parametrizadas ($1, $2, etc.)", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Logging de tempo de execu\u00e7\u00e3o de cada query", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Erros logados com query truncada (seguran\u00e7a)", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 200 }, children: [new TextRun({ text: "Connection pool gerenciado automaticamente pelo driver", font: "Arial", size: 20 })] }),

        subTitle("6.4 Transa\u00e7\u00f5es"),
        bodyText("Opera\u00e7\u00f5es cr\u00edticas (gera\u00e7\u00e3o de cr\u00e9ditos) usam transa\u00e7\u00f5es expl\u00edcitas com o padr\u00e3o BEGIN \u2192 opera\u00e7\u00f5es \u2192 COMMIT (sucesso) ou ROLLBACK (erro). O m\u00e9todo client.release() no bloco finally garante retorno da conex\u00e3o ao pool."),

        subTitle("6.5 Tabelas Principais"),
        tabelasBanco(),

        // ==================== SECTION 7 ====================
        new Paragraph({ children: [new PageBreak()] }),
        sectionTitle("7. Depend\u00eancias e Vers\u00f5es"),
        subTitle("7.1 Backend (Node.js)"),
        depsTable(backendDeps),
        bodyText(""),
        subTitle("7.2 Frontend (React)"),
        depsTable(frontendDeps),

        // ==================== SECTION 8 ====================
        new Paragraph({ children: [new PageBreak()] }),
        sectionTitle("8. Recomenda\u00e7\u00f5es de Seguran\u00e7a"),

        subTitle("8.1 Prioridade Alta"),
        new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Migra\u00e7\u00e3o de MD5 para bcrypt na hash de senhas \u2014 MD5 \u00e9 criptograficamente quebrado; bcrypt j\u00e1 est\u00e1 instalado como depend\u00eancia", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Implementar rota\u00e7\u00e3o de JWT_SECRET com suporte a chaves antigas durante transi\u00e7\u00e3o", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "numbers", level: 0 }, spacing: { after: 200 }, children: [new TextRun({ text: "Mover configura\u00e7\u00e3o SMTP de tabela do banco para vari\u00e1veis de ambiente ou vault seguro", font: "Arial", size: 20 })] }),

        subTitle("8.2 Prioridade M\u00e9dia"),
        new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Implementar mecanismo de refresh token para renova\u00e7\u00e3o autom\u00e1tica de sess\u00f5es expiradas", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Adicionar CSRF protection nas submiss\u00f5es de formul\u00e1rios", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Considerar criptografia de CPF em repouso no banco de dados (compliance LGPD)", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Adicionar assinatura digital nos PDFs gerados para garantir autenticidade", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "numbers", level: 0 }, spacing: { after: 200 }, children: [new TextRun({ text: "For\u00e7ar HTTPS via redirect no n\u00edvel da aplica\u00e7\u00e3o ou reverse proxy", font: "Arial", size: 20 })] }),

        subTitle("8.3 Prioridade Baixa"),
        new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Implementar logging centralizado (ELK Stack, CloudWatch ou similar)", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Adicionar monitoramento de erros (Sentry ou similar)", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text: "Incluir package-lock.json no controle de vers\u00e3o para builds reproduz\u00edveis", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "numbers", level: 0 }, spacing: { after: 200 }, children: [new TextRun({ text: "Atualizar Axios para vers\u00e3o mais recente (1.7.x)", font: "Arial", size: 20 })] }),

        // ==================== SECTION 9 ====================
        new Paragraph({ children: [new PageBreak()] }),
        sectionTitle("9. Checklist de Deploy em Produ\u00e7\u00e3o"),
        bodyText("Itens obrigat\u00f3rios antes de colocar a aplica\u00e7\u00e3o em produ\u00e7\u00e3o:"),
        new Paragraph({ numbering: { reference: "checklist", level: 0 }, children: [new TextRun({ text: "JWT_SECRET gerado com openssl rand -hex 32", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "checklist", level: 0 }, children: [new TextRun({ text: "NODE_ENV=production configurado", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "checklist", level: 0 }, children: [new TextRun({ text: "CORS_ORIGIN com dom\u00ednios reais da aplica\u00e7\u00e3o", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "checklist", level: 0 }, children: [new TextRun({ text: "Banco de dados com SSL habilitado", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "checklist", level: 0 }, children: [new TextRun({ text: "HTTPS configurado no reverse proxy (nginx/load balancer)", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "checklist", level: 0 }, children: [new TextRun({ text: "Rate limits ajustados ao tr\u00e1fego real", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "checklist", level: 0 }, children: [new TextRun({ text: "Backups do banco configurados", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "checklist", level: 0 }, children: [new TextRun({ text: "Certificados SSL v\u00e1lidos com auto-renova\u00e7\u00e3o", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "checklist", level: 0 }, children: [new TextRun({ text: "Vari\u00e1veis de ambiente protegidas (vault ou secrets manager)", font: "Arial", size: 20 })] }),
        new Paragraph({ numbering: { reference: "checklist", level: 0 }, children: [new TextRun({ text: "Logs de acesso e erro monitorados", font: "Arial", size: 20 })] }),
      ],
    },
  ],
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("C:\\Users\\rafae\\claudio\\BRG\\Relatorio_Tecnico_BRGorjeta.docx", buffer);
  console.log("OK: Relatorio_Tecnico_BRGorjeta.docx gerado com sucesso!");
});
