/**
 * Rotas de Créditos
 */

const express = require('express');
const router = express.Router();

const creditosController = require('../controllers/creditos.controller');
const authMiddleware = require('../middlewares/auth');
const verificarClienteId = require('../middlewares/verificarClienteId');

// Todas as rotas exigem autenticação. O proxy de boleto/QR valida tenant
// dentro do controller (lookup do crd_cli_id da nota), por isso passa só
// pelo authMiddleware — não pelo verificarClienteId, que opera por query.
router.get('/nota/:nota_id/pdf', authMiddleware, creditosController.obterBoletoPdf);
router.get('/nota/:nota_id/qrcode', authMiddleware, creditosController.obterBoletoQrCode);

router.use(authMiddleware);
router.use(verificarClienteId);

router.post('/gerar', creditosController.gerarCredito);
router.get('/historico', creditosController.obterHistorico);
router.get('/remessa/:remessa_id', creditosController.obterDetalheRemessa);
router.delete('/remessa/:remessa_id', creditosController.cancelarRemessa);
router.post('/remessa/:remessa_id/boleto', creditosController.reemitirBoleto);

module.exports = router;
