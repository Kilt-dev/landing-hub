const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { isAdmin } = require('../middleware/authMiddleware');
const paymentController = require('../controllers/paymentController');

/**
 * Admin routes - đặt trước
 */

// Admin: Lấy tất cả transactions
router.get('/admin/transactions', authMiddleware, isAdmin, paymentController.getAllTransactionsAdmin);

// Admin: Lấy thống kê
router.get('/admin/stats', authMiddleware, isAdmin, paymentController.getPaymentStatsAdmin);

// Admin: Export transactions
router.get('/admin/export', authMiddleware, isAdmin, paymentController.exportTransactionsAdmin);

/**
 * Protected routes - yêu cầu authentication
 */

// User: Lấy lịch sử giao dịch của mình
router.get('/transactions', authMiddleware, paymentController.getUserTransactions);

// User: Lấy thống kê cá nhân
router.get('/stats', authMiddleware, paymentController.getUserStats);

// User: Export transactions của mình
router.get('/export', authMiddleware, paymentController.exportUserTransactions);

// Tạo transaction và payment URL
router.post('/create-transaction', authMiddleware, paymentController.createTransaction);

// Lấy trạng thái transaction
router.get('/transaction/:id', authMiddleware, paymentController.getTransactionStatus);

// Lấy lịch sử mua hàng
router.get('/purchases', authMiddleware, paymentController.getPurchaseHistory);

// Lấy lịch sử bán hàng
router.get('/sales', authMiddleware, paymentController.getSalesHistory);

// Check if user has purchased a page
router.get('/check-purchase/:marketplace_page_id', authMiddleware, paymentController.checkPurchase);

// Request refund
router.post('/refund/request', authMiddleware, paymentController.requestRefund);

/**
 * Payment gateway callbacks - public
 */

// MOMO IPN callback
router.post('/momo/ipn', paymentController.momoIPN);

// MOMO return URL
router.get('/momo/return', paymentController.momoReturn);

// VNPay IPN callback
router.get('/vnpay/ipn', paymentController.vnpayIPN);

// VNPay return URL
router.get('/vnpay/return', paymentController.vnpayReturn);

// Sandbox confirm (for testing)
router.post('/sandbox/confirm', paymentController.sandboxConfirm);

module.exports = router;