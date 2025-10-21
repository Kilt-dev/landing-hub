const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const marketplaceController = require('../controllers/marketplaceController');

/**
 * Public routes - không cần authentication
 */

// Lấy danh sách marketplace pages
router.get('/', marketplaceController.getMarketplacePages);

// Lấy chi tiết marketplace page
router.get('/:id', marketplaceController.getMarketplacePageDetail);

// Lấy featured pages
router.get('/featured/list', marketplaceController.getFeaturedPages);

// Lấy bestsellers
router.get('/bestsellers/list', marketplaceController.getBestsellers);

// Lấy new arrivals
router.get('/new-arrivals/list', marketplaceController.getNewArrivals);

/**
 * Protected routes - yêu cầu authentication
 */

// Đăng bán landing page
router.post('/sell', auth, marketplaceController.sellPage);

// Cập nhật marketplace page
router.put('/:id', auth, marketplaceController.updateMarketplacePage);

// Xóa marketplace page
router.delete('/:id', auth, marketplaceController.deleteMarketplacePage);

// Lấy marketplace pages của user
router.get('/my/pages', auth, marketplaceController.getMyMarketplacePages);

// Like/Unlike marketplace page
router.post('/:id/like', auth, marketplaceController.toggleLike);

// Lấy thống kê seller
router.get('/seller/stats', auth, marketplaceController.getSellerStats);

// Download marketplace page as HTML ZIP
router.get('/:id/download/html', auth, marketplaceController.downloadAsHTML);

// Download marketplace page as .iuhpage
router.get('/:id/download/iuhpage', auth, marketplaceController.downloadAsIUHPage);

module.exports = router;