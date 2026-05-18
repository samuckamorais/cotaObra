jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { analyticsService } from '../../../src/services/analytics.service';
import { logger } from '../../../src/utils/logger';

beforeEach(() => jest.resetAllMocks());

describe('AnalyticsService', () => {
  describe('trackEvent', () => {
    it('loga o evento com timestamp', () => {
      analyticsService.trackEvent('QUOTE_CREATED', { quoteId: 'q-1' });

      expect(logger.info).toHaveBeenCalledWith(
        '[analytics] QUOTE_CREATED',
        expect.objectContaining({
          quoteId: 'q-1',
          timestamp: expect.any(String),
        }),
      );
    });

    it('loga evento sem propriedades extras', () => {
      analyticsService.trackEvent('APP_STARTED');

      expect(logger.info).toHaveBeenCalledWith(
        '[analytics] APP_STARTED',
        expect.objectContaining({ timestamp: expect.any(String) }),
      );
    });
  });
});
