import { Router } from 'express';
import { whatsappConfigController } from './whatsapp-config.controller';

const router = Router();

// Todas as rotas requerem autenticação (middleware será adicionado no app.ts)

// Obter configuração atual
router.get('/config', (req, res) => whatsappConfigController.getConfig(req, res));

// Atualizar configuração
router.put('/config', (req, res) => whatsappConfigController.updateConfig(req, res));

// Deletar configuração
router.delete('/config', (req, res) => whatsappConfigController.deleteConfig(req, res));

// Testar conexão
router.post('/test', (req, res) => whatsappConfigController.testConnection(req, res));

// Obter QR Code (Evolution API)
router.get('/qrcode', (req, res) => whatsappConfigController.getQRCode(req, res));

// Reconectar
router.post('/reconnect', (req, res) => whatsappConfigController.reconnect(req, res));

// Estatísticas
router.get('/stats', (req, res) => whatsappConfigController.getStats(req, res));

// Logs de auditoria
router.get('/logs', (req, res) => whatsappConfigController.getLogs(req, res));

export default router;
