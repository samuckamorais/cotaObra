import { Router } from 'express';
import { analyticsController } from './analytics.controller';

const router = Router();

// Analytics endpoints
router.get('/overview', (req, res) => analyticsController.getOverview(req, res));
router.get('/conversion-rate', (req, res) => analyticsController.getConversionRate(req, res));
router.get('/funnel', (req, res) => analyticsController.getConversionFunnel(req, res));
router.get('/time-per-state', (req, res) => analyticsController.getTimePerState(req, res));
router.get('/errors', (req, res) => analyticsController.getErrorDistribution(req, res));
router.get('/first-response-rate', (req, res) => analyticsController.getFirstResponseRate(req, res));

// Experiments endpoints
router.get('/experiments', (req, res) => analyticsController.listExperiments(req, res));
router.get('/experiments/:name/stats', (req, res) => analyticsController.getExperimentStats(req, res));
router.get('/experiments/:name/compare', (req, res) => analyticsController.compareVariants(req, res));
router.post('/experiments', (req, res) => analyticsController.createExperiment(req, res));
router.delete('/experiments/:name', (req, res) => analyticsController.deactivateExperiment(req, res));

export default router;
