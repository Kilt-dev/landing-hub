const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const paymentController = require('../controllers/paymentController');

/**
 * Protected routes - yêu cầu authentication
 */

// Tạo transaction và payment URL
router.post('/create-transaction', auth, paymentController.createTransaction);

// Lấy trạng thái transaction
router.get('/transaction/:id', auth, paymentController.getTransactionStatus);

// Lấy lịch sử mua hàng
router.get('/purchases', auth, paymentController.getPurchaseHistory);

// Lấy lịch sử bán hàng
router.get('/sales', auth, paymentController.getSalesHistory);

// Check if user has purchased a page
router.get('/check-purchase/:marketplace_page_id', auth, paymentController.checkPurchase);

// Request refund
router.post('/refund/request', auth, paymentController.requestRefund);

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