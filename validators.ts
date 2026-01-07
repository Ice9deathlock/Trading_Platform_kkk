import { body, param, query, ValidationChain } from 'express-validator';

// User validators
export const registerValidator = (): ValidationChain[] => [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/[a-z]/)
    .withMessage('Password must contain at least one lowercase letter')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/\d/)
    .withMessage('Password must contain at least one number'),
  body('first_name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('last_name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
];

export const loginValidator = (): ValidationChain[] => [
  body('email')
    .isEmail()
    .withMessage('Please include a valid email')
    .normalizeEmail(),
  body('password')
    .exists()
    .withMessage('Password is required'),
];

export const refreshTokenValidator = (): ValidationChain[] => [
  body('refreshToken')
    .notEmpty()
    .withMessage('Refresh token is required'),
];

export const forgotPasswordValidator = (): ValidationChain[] => [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
];

export const resetPasswordValidator = (): ValidationChain[] => [
  param('token')
    .notEmpty()
    .withMessage('Reset token is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/[a-z]/)
    .withMessage('Password must contain at least one lowercase letter')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/\d/)
    .withMessage('Password must contain at least one number'),
  body('confirmPassword')
    .notEmpty()
    .withMessage('Please confirm your password')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
];

export const verifyEmailValidator = (): ValidationChain[] => [
  param('token')
    .notEmpty()
    .withMessage('Verification token is required'),
];

export const updateProfileValidator = (): ValidationChain[] => [
  body('first_name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('last_name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
];

export const changePasswordValidator = (): ValidationChain[] => [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .notEmpty()
    .withMessage('New password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/[a-z]/)
    .withMessage('Password must contain at least one lowercase letter')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/\d/)
    .withMessage('Password must contain at least one number')
    .custom((value, { req }) => {
      if (value === req.body.currentPassword) {
        throw new Error('New password must be different from current password');
      }
      return true;
    }),
  body('confirmPassword')
    .notEmpty()
    .withMessage('Please confirm your password')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
];

// Trading validators
export const createOrderValidator = (): ValidationChain[] => [
  body('symbol')
    .notEmpty()
    .withMessage('Trading symbol is required'),
  body('type')
    .isIn(['MARKET', 'LIMIT'])
    .withMessage('Invalid order type'),
  body('side')
    .isIn(['BUY', 'SELL'])
    .withMessage('Invalid order side'),
  body('quantity')
    .isFloat({ gt: 0 })
    .withMessage('Quantity must be greater than 0'),
  body('price')
    .if(body('type').equals('LIMIT'))
    .isFloat({ gt: 0 })
    .withMessage('Price must be greater than 0 for LIMIT orders'),
];

export const cancelOrderValidator = (): ValidationChain[] => [
  param('orderId')
    .notEmpty()
    .withMessage('Order ID is required'),
];

export const getOrderBookValidator = (): ValidationChain[] => [
  param('symbol')
    .notEmpty()
    .withMessage('Trading symbol is required'),
  query('limit')
    .optional()
    .isInt({ min: 5, max: 1000 })
    .withMessage('Limit must be between 5 and 1000'),
];

export const getTradesValidator = (): ValidationChain[] => [
  param('symbol')
    .notEmpty()
    .withMessage('Trading symbol is required'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Limit must be between 1 and 1000'),
];
