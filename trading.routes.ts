import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { validateRequest } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import * as tradingController from '../controllers/trading.controller';

const router = Router();

// Apply authentication middleware to all trading routes
router.use(authenticate);

// Order routes
router.post(
  '/orders',
  [
    body('symbol')
      .isString()
      .notEmpty()
      .withMessage('Symbol is required')
      .matches(/^[A-Z0-9]+$/)
      .withMessage('Symbol must be alphanumeric'),
    body('type')
      .isIn(['LIMIT', 'MARKET', 'STOP_LOSS', 'STOP_LOSS_LIMIT', 'TAKE_PROFIT', 'TAKE_PROFIT_LIMIT', 'LIMIT_MAKER'])
      .withMessage('Invalid order type'),
    body('side')
      .isIn(['BUY', 'SELL'])
      .withMessage('Invalid order side'),
    body('quantity')
      .isFloat({ gt: 0 })
      .withMessage('Quantity must be greater than 0'),
    body('price')
      .optional()
      .isFloat({ gt: 0 })
      .withMessage('Price must be greater than 0')
      .custom((value, { req }) => {
        if (req.body.type !== 'MARKET' && !value) {
          throw new Error('Price is required for non-market orders');
        }
        return true;
      }),
    body('timeInForce')
      .optional()
      .isIn(['GTC', 'IOC', 'FOK'])
      .withMessage('Invalid time in force'),
    body('stopPrice')
      .optional()
      .isFloat({ gt: 0 })
      .withMessage('Stop price must be greater than 0'),
    body('icebergQty')
      .optional()
      .isFloat({ gt: 0 })
      .withMessage('Iceberg quantity must be greater than 0'),
    body('clientOrderId')
      .optional()
      .isString()
      .withMessage('Client order ID must be a string'),
    validateRequest
  ],
  tradingController.createOrder
);

// Cancel an order
router.delete(
  '/orders/:orderId',
  [
    param('orderId')
      .isString()
      .notEmpty()
      .withMessage('Order ID is required'),
    validateRequest
  ],
  tradingController.cancelOrder
);

// Get order details
router.get(
  '/orders/:orderId',
  [
    param('orderId')
      .isString()
      .notEmpty()
      .withMessage('Order ID is required'),
    validateRequest
  ],
  tradingController.getOrder
);

// Get order book (market depth)
router.get(
  '/depth/:symbol',
  [
    param('symbol')
      .isString()
      .notEmpty()
      .withMessage('Symbol is required'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Limit must be between 1 and 1000'),
    validateRequest
  ],
  tradingController.getOrderBook
);

// Get user's trades
router.get(
  '/trades',
  [
    query('symbol')
      .optional()
      .isString()
      .withMessage('Symbol must be a string'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Limit must be between 1 and 1000'),
    validateRequest
  ],
  tradingController.getTrades
);

// Get account balances
router.get(
  '/account/balances',
  [],
  tradingController.getBalances
);

// Deposit funds
router.post(
  '/account/deposit',
  [
    body('asset')
      .isString()
      .notEmpty()
      .withMessage('Asset is required')
      .isUppercase()
      .withMessage('Asset must be in uppercase'),
    body('amount')
      .isFloat({ gt: 0 })
      .withMessage('Amount must be greater than 0'),
    validateRequest
  ],
  tradingController.depositFunds
);

// Withdraw funds
router.post(
  '/account/withdraw',
  [
    body('asset')
      .isString()
      .notEmpty()
      .withMessage('Asset is required')
      .isUppercase()
      .withMessage('Asset must be in uppercase'),
    body('amount')
      .isFloat({ gt: 0 })
      .withMessage('Amount must be greater than 0'),
    body('address')
      .isString()
      .notEmpty()
      .withMessage('Withdrawal address is required'),
    validateRequest
  ],
  tradingController.withdrawFunds
);

// WebSocket endpoint for real-time updates
router.ws('/ws', (ws, req) => {
  tradingController.handleWebSocketConnection(ws, req);
});

export default router;
