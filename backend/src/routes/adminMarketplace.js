const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminMiddleware = require('../middleware/adminMiddleware');
const adminMarketplaceController = require('../controllers/adminMarketplaceController');

/**
 * Tất cả routes đều yêu cầu authentication và admin role
 */
router.use(auth);
router.use(adminMiddleware);

/**
 * Marketplace management
 */

// Lấy danh sách pending pages
router.get('/pending', adminMarketplaceController.getPendingPages);

// Lấy tất cả marketplace pages
router.get('/pages', adminMarketplaceController.getAllMarketplacePages);

// Approve marketplace page
router.post('/pages/:id/approve', adminMarketplaceController.approvePage);

// Reject marketplace page
router.post('/pages/:id/reject', adminMarketplaceController.rejectPage);

// Suspend marketplace page
router.post('/pages/:id/suspend', adminMarketplaceController.suspendPage);

// Toggle featured status
router.post('/pages/:id/toggle-featured', adminMarketplaceController.toggleFeatured);

// Delete marketplace page
router.delete('/pages/:id', adminMarketplaceController.deletePage);

// Lấy marketplace statistics
router.get('/stats', adminMarketplaceController.getMarketplaceStats);

/**
 * Transaction management
 */

// Lấy tất cả transactions
router.get('/transactions', adminMarketplaceController.getAllTransactions);

// Lấy refund requests
router.get('/refunds', adminMarketplaceController.getRefundRequests);

// Process refund
router.post('/refunds/process', adminMarketplaceController.processRefund);

// Reject refund
router.post('/refunds/reject', adminMarketplaceController.rejectRefund);

module.exports = router;