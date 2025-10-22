const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const MarketplacePage = require('../models/MarketplacePage');
const Page = require('../models/Page');
const paymentService = require('../services/payment/paymentService');
const { v4: uuidv4 } = require('uuid');

/**
 * Tạo transaction và payment URL
 */
// paymentController.js
exports.createTransaction = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { marketplace_page_id, payment_method } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Không tìm thấy thông tin người dùng. Vui lòng đăng nhập lại.'
            });
        }

        const validMethods = ['MOMO', 'VNPAY', 'SANDBOX'];
        if (!validMethods.includes(payment_method)) {
            return res.status(400).json({
                success: false,
                message: 'Phương thức thanh toán không hợp lệ'
            });
        }

        const marketplacePage = await MarketplacePage.findById(marketplace_page_id)
            .populate('seller_id');

        if (!marketplacePage) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy landing page'
            });
        }

        if (!marketplacePage.seller_id?._id) {
            return res.status(400).json({
                success: false,
                message: 'Không tìm thấy thông tin người bán cho landing page này'
            });
        }

        if (marketplacePage.status !== 'ACTIVE') {
            return res.status(400).json({
                success: false,
                message: 'Landing page không khả dụng'
            });
        }

        // Bỏ qua kiểm tra "mua của chính mình" trong môi trường SANDBOX
        if (payment_method !== 'SANDBOX' && marketplacePage.seller_id._id.toString() === userId.toString()) {
            return res.status(400).json({
                success: false,
                message: 'Bạn không thể mua landing page của chính mình'
            });
        }

        // Tính toán phí
        const amount = marketplacePage.price;
        const platform_fee = paymentService.calculatePlatformFee(amount);
        const seller_amount = paymentService.calculateSellerAmount(amount);

        // Lấy IP address và user agent
        const ip_address = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress;
        const user_agent = req.headers['user-agent'];

        // Tạo transaction
        const transaction = new Transaction({
            marketplace_page_id: marketplace_page_id,
            buyer_id: userId,
            seller_id: marketplacePage.seller_id._id,
            amount: amount,
            platform_fee: platform_fee,
            seller_amount: seller_amount,
            payment_method: payment_method,
            status: 'PENDING',
            ip_address: ip_address,
            user_agent: user_agent,
            metadata: {
                page_title: marketplacePage.title,
                page_category: marketplacePage.category
            }
        });

        await transaction.save();

        // Tạo payment URL
        const paymentResult = await paymentService.createPayment(
            transaction,
            payment_method,
            ip_address
        );

        if (!paymentResult.success) {
            await transaction.markAsFailed(paymentResult.error);
            return res.status(400).json({
                success: false,
                message: 'Không thể tạo thanh toán: ' + paymentResult.error
            });
        }

        res.json({
            success: true,
            message: 'Giao dịch đã được tạo',
            data: {
                transaction_id: transaction._id,
                payment_url: paymentResult.paymentUrl || paymentResult.payUrl,
                qr_code_url: paymentResult.qrCodeUrl,
                deep_link: paymentResult.deeplink,
                amount: amount,
                expires_at: transaction.expires_at
            }
        });
    } catch (error) {
        console.error('Create Transaction Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo giao dịch',
            error: error.message
        });
    }
};
/**
 * IPN callback từ MOMO
 */
exports.momoIPN = async (req, res) => {
    try {
        console.log('MOMO IPN Received:', req.body);

        const verification = paymentService.verifyCallback('MOMO', req.body);

        if (!verification.valid) {
            return res.status(400).json({
                success: false,
                message: 'Invalid signature'
            });
        }

        const { orderId, transId, resultCode } = verification.data;

        // Lấy transaction
        const transaction = await Transaction.findById(orderId);

        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: 'Transaction not found'
            });
        }

        // Cập nhật transaction với gateway data
        transaction.payment_gateway_transaction_id = transId;
        transaction.payment_gateway_response = req.body;

        if (resultCode === 0) {
            // Payment success
            await paymentService.processPaymentSuccess(orderId, req.body);
        } else {
            // Payment failed
            await transaction.markAsFailed(`MOMO Error: ${req.body.message}`);
        }

        res.status(200).json({
            success: true,
            message: 'IPN processed'
        });
    } catch (error) {
        console.error('MOMO IPN Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Return callback từ MOMO (redirect user)
 */
exports.momoReturn = async (req, res) => {
    try {
        const { orderId, resultCode } = req.query;

        // Redirect to frontend với kết quả
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const redirectUrl = `${frontendUrl}/payment/result?transaction_id=${orderId}&status=${resultCode === '0' ? 'success' : 'failed'}`;

        res.redirect(redirectUrl);
    } catch (error) {
        console.error('MOMO Return Error:', error);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        res.redirect(`${frontendUrl}/payment/result?status=error`);
    }
};

/**
 * IPN callback từ VNPay
 */
exports.vnpayIPN = async (req, res) => {
    try {
        console.log('VNPay IPN Received:', req.query);

        const verification = paymentService.verifyCallback('VNPAY', req.query);

        if (!verification.valid) {
            return res.status(200).json({
                RspCode: '97',
                Message: 'Invalid signature'
            });
        }

        const { orderId, transactionNo, responseCode } = verification.data;

        // Lấy transaction
        const transaction = await Transaction.findById(orderId);

        if (!transaction) {
            return res.status(200).json({
                RspCode: '01',
                Message: 'Transaction not found'
            });
        }

        // Cập nhật transaction
        transaction.payment_gateway_transaction_id = transactionNo;
        transaction.payment_gateway_response = req.query;

        if (responseCode === '00') {
            // Payment success
            await paymentService.processPaymentSuccess(orderId, req.query);

            return res.status(200).json({
                RspCode: '00',
                Message: 'Success'
            });
        } else {
            // Payment failed
            await transaction.markAsFailed(`VNPay Error: ${responseCode}`);

            return res.status(200).json({
                RspCode: '00',
                Message: 'Confirmed'
            });
        }
    } catch (error) {
        console.error('VNPay IPN Error:', error);
        res.status(200).json({
            RspCode: '99',
            Message: error.message
        });
    }
};

/**
 * Return callback từ VNPay
 */
exports.vnpayReturn = async (req, res) => {
    try {
        const { vnp_TxnRef: orderId, vnp_ResponseCode: responseCode } = req.query;

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const redirectUrl = `${frontendUrl}/payment/result?transaction_id=${orderId}&status=${responseCode === '00' ? 'success' : 'failed'}`;

        res.redirect(redirectUrl);
    } catch (error) {
        console.error('VNPay Return Error:', error);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        res.redirect(`${frontendUrl}/payment/result?status=error`);
    }
};

/**
 * Sandbox payment confirm (for testing)
 */
exports.sandboxConfirm = async (req, res) => {
    try {
        const { transaction_id, success = true } = req.body;

        const sandboxService = require('../services/payment/sandboxService');
        const result = await sandboxService.confirmPayment(transaction_id, success);

        if (result.success) {
            if (success) {
                await paymentService.processPaymentSuccess(transaction_id, result.data);
            } else {
                const transaction = await Transaction.findById(transaction_id);
                if (transaction) {
                    await transaction.markAsFailed('User cancelled payment');
                }
            }
        }

        res.json({
            success: true,
            message: 'Sandbox payment confirmed',
            data: result.data
        });
    } catch (error) {
        console.error('Sandbox Confirm Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Lấy trạng thái transaction
 */
exports.getTransactionStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const transaction = await Transaction.findById(id)
            .populate('marketplace_page_id')
            .populate('buyer_id', 'name email')
            .populate('seller_id', 'name email')
            .populate('created_page_id');

        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy giao dịch'
            });
        }

        // Chỉ buyer hoặc seller mới xem được
        if (
            transaction.buyer_id._id.toString() !== userId.toString() &&
            transaction.seller_id._id.toString() !== userId.toString()
        ) {
            return res.status(403).json({
                success: false,
                message: 'Bạn không có quyền xem giao dịch này'
            });
        }

        res.json({
            success: true,
            data: transaction
        });
    } catch (error) {
        console.error('Get Transaction Status Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy trạng thái giao dịch',
            error: error.message
        });
    }
};

/**
 * Lấy lịch sử mua hàng (buyer)
 */
exports.getPurchaseHistory = async (req, res) => {
    try {
        const userId = req.user.id;

        const transactions = await Transaction.findUserPurchases(userId);

        res.json({
            success: true,
            data: transactions
        });
    } catch (error) {
        console.error('Get Purchase History Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy lịch sử mua hàng',
            error: error.message
        });
    }
};

/**
 * Lấy lịch sử bán hàng (seller)
 */
exports.getSalesHistory = async (req, res) => {
    try {
        const userId = req.user.id;

        const transactions = await Transaction.findUserSales(userId);

        res.json({
            success: true,
            data: transactions
        });
    } catch (error) {
        console.error('Get Sales History Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy lịch sử bán hàng',
            error: error.message
        });
    }
};

/**
 * Request refund (buyer)
 */
exports.requestRefund = async (req, res) => {
    try {
        const userId = req.user.id;
        const { transaction_id, reason } = req.body;

        const transaction = await Transaction.findById(transaction_id);

        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy giao dịch'
            });
        }

        if (transaction.buyer_id.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Bạn không có quyền yêu cầu hoàn tiền cho giao dịch này'
            });
        }

        await transaction.requestRefund(reason);

        res.json({
            success: true,
            message: 'Đã gửi yêu cầu hoàn tiền. Admin sẽ xem xét trong thời gian sớm nhất.',
            data: transaction
        });
    } catch (error) {
        console.error('Request Refund Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * ADMIN: Lấy tất cả transactions
 */
exports.getAllTransactionsAdmin = async (req, res) => {
    try {
        const { status, payment_method, start_date, end_date, page = 1, limit = 10 } = req.query;

        let query = {};

        if (status) {
            query.status = status;
        }

        if (payment_method) {
            query.payment_method = payment_method;
        }

        if (start_date || end_date) {
            query.created_at = {};
            if (start_date) {
                query.created_at.$gte = new Date(start_date);
            }
            if (end_date) {
                query.created_at.$lte = new Date(end_date);
            }
        }

        const skip = (page - 1) * limit;

        const transactions = await Transaction.find(query)
            .populate('buyer_id', 'name email')
            .populate('seller_id', 'name email')
            .populate('marketplace_page_id', 'title price')
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Transaction.countDocuments(query);

        res.json({
            success: true,
            data: transactions,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get All Transactions Admin Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * ADMIN: Lấy thống kê thanh toán
 */
exports.getPaymentStatsAdmin = async (req, res) => {
    try {
        const totalRevenue = await Transaction.aggregate([
            { $match: { status: 'COMPLETED' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        const totalPlatformFee = await Transaction.aggregate([
            { $match: { status: 'COMPLETED' } },
            { $group: { _id: null, total: { $sum: '$platform_fee' } } }
        ]);

        const completedCount = await Transaction.countDocuments({ status: 'COMPLETED' });
        const pendingCount = await Transaction.countDocuments({ status: 'PENDING' });
        const failedCount = await Transaction.countDocuments({ status: 'FAILED' });

        res.json({
            success: true,
            data: {
                totalRevenue: totalRevenue[0]?.total || 0,
                totalPlatformFee: totalPlatformFee[0]?.total || 0,
                completedCount,
                pendingCount,
                failedCount
            }
        });
    } catch (error) {
        console.error('Get Payment Stats Admin Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * ADMIN: Export transactions
 */
exports.exportTransactionsAdmin = async (req, res) => {
    try {
        const { status, payment_method, start_date, end_date } = req.query;

        let query = {};

        if (status) query.status = status;
        if (payment_method) query.payment_method = payment_method;
        if (start_date || end_date) {
            query.created_at = {};
            if (start_date) query.created_at.$gte = new Date(start_date);
            if (end_date) query.created_at.$lte = new Date(end_date);
        }

        const transactions = await Transaction.find(query)
            .populate('buyer_id', 'name email')
            .populate('seller_id', 'name email')
            .populate('marketplace_page_id', 'title price')
            .sort({ created_at: -1 });

        // Create CSV
        let csv = 'ID,Date,Buyer,Seller,Product,Amount,Fee,Status,Method\n';
        transactions.forEach(txn => {
            csv += `${txn._id},${txn.created_at},${txn.buyer_id?.email || 'N/A'},${txn.seller_id?.email || 'N/A'},${txn.marketplace_page_id?.title || 'N/A'},${txn.amount},${txn.platform_fee},${txn.status},${txn.payment_method}\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=transactions.csv');
        res.send(csv);
    } catch (error) {
        console.error('Export Transactions Admin Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * USER: Lấy transactions của user
 */
exports.getUserTransactions = async (req, res) => {
    try {
        const userId = req.user.id;
        const { status, payment_method, start_date, end_date, page = 1, limit = 10 } = req.query;

        let query = {
            $or: [
                { buyer_id: userId },
                { seller_id: userId }
            ]
        };

        if (status) query.status = status;
        if (payment_method) query.payment_method = payment_method;
        if (start_date || end_date) {
            query.created_at = {};
            if (start_date) query.created_at.$gte = new Date(start_date);
            if (end_date) query.created_at.$lte = new Date(end_date);
        }

        const skip = (page - 1) * limit;

        const transactions = await Transaction.find(query)
            .populate('buyer_id', 'name email')
            .populate('seller_id', 'name email')
            .populate('marketplace_page_id', 'title price')
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Transaction.countDocuments(query);

        res.json({
            success: true,
            data: transactions,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get User Transactions Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
exports.checkPurchase = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { marketplace_page_id } = req.params;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Không tìm thấy thông tin người dùng. Vui lòng đăng nhập lại.'
            });
        }

        const transaction = await Transaction.findOne({
            buyer_id: userId,
            marketplace_page_id: marketplace_page_id,
            status: 'COMPLETED'
        });

        res.json({
            success: true,
            hasPurchased: !!transaction
        });
    } catch (error) {
        console.error('Check Purchase Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi kiểm tra trạng thái mua hàng',
            error: error.message
        });
    }
};
/**
 * USER: Lấy thống kê cá nhân
 */
exports.getUserStats = async (req, res) => {
    try {
        const userId = req.user.id;

        console.log('getUserStats userId:', userId);

        // Convert to ObjectId for aggregation pipeline
        const userObjectId = new mongoose.Types.ObjectId(userId);

        // Tổng chi tiêu (as buyer)
        const totalSpent = await Transaction.aggregate([
            { $match: { buyer_id: userObjectId, status: 'COMPLETED' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        // Tổng doanh thu (as seller) - tổng tiền trước khi trừ phí
        const totalRevenue = await Transaction.aggregate([
            { $match: { seller_id: userObjectId, status: 'COMPLETED' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        // Tổng thu nhập thực (as seller) - sau khi trừ phí platform
        const totalEarned = await Transaction.aggregate([
            { $match: { seller_id: userObjectId, status: 'COMPLETED' } },
            { $group: { _id: null, total: { $sum: '$seller_amount' } } }
        ]);

        // Số tiền chờ chuyển (đã bán thành công nhưng chưa được admin chuyển tiền)
        const pendingPayout = await Transaction.aggregate([
            {
                $match: {
                    seller_id: userObjectId,
                    status: 'COMPLETED',
                    payout_status: { $ne: 'COMPLETED' }
                }
            },
            { $group: { _id: null, total: { $sum: '$seller_amount' } } }
        ]);

        // Số tiền đã nhận (đã được admin chuyển)
        const completedPayout = await Transaction.aggregate([
            {
                $match: {
                    seller_id: userObjectId,
                    status: 'COMPLETED',
                    payout_status: 'COMPLETED'
                }
            },
            { $group: { _id: null, total: { $sum: '$seller_amount' } } }
        ]);

        const purchaseCount = await Transaction.countDocuments({
            buyer_id: userId,
            status: 'COMPLETED'
        });

        const salesCount = await Transaction.countDocuments({
            seller_id: userId,
            status: 'COMPLETED'
        });

        res.json({
            success: true,
            data: {
                // Buyer stats
                totalSpent: totalSpent[0]?.total || 0,
                purchaseCount,

                // Seller stats
                totalRevenue: totalRevenue[0]?.total || 0,  // Tổng doanh thu
                totalEarned: totalEarned[0]?.total || 0,     // Thu nhập thực (sau trừ phí)
                salesCount,                                   // Số lượt bán
                pendingPayout: pendingPayout[0]?.total || 0, // Chờ rút tiền
                completedPayout: completedPayout[0]?.total || 0, // Đã nhận

                // Overall stats
                completedCount: purchaseCount + salesCount,
                pendingCount: await Transaction.countDocuments({
                    $or: [{ buyer_id: userId }, { seller_id: userId }],
                    status: 'PENDING'
                }),
                failedCount: await Transaction.countDocuments({
                    $or: [{ buyer_id: userId }, { seller_id: userId }],
                    status: 'FAILED'
                })
            }
        });
    } catch (error) {
        console.error('Get User Stats Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * USER: Export transactions của user
 */
exports.exportUserTransactions = async (req, res) => {
    try {
        const userId = req.user.id;
        const { status, payment_method, start_date, end_date } = req.query;

        let query = {
            $or: [
                { buyer_id: userId },
                { seller_id: userId }
            ]
        };

        if (status) query.status = status;
        if (payment_method) query.payment_method = payment_method;
        if (start_date || end_date) {
            query.created_at = {};
            if (start_date) query.created_at.$gte = new Date(start_date);
            if (end_date) query.created_at.$lte = new Date(end_date);
        }

        const transactions = await Transaction.find(query)
            .populate('buyer_id', 'name email')
            .populate('seller_id', 'name email')
            .populate('marketplace_page_id', 'title price')
            .sort({ created_at: -1 });

        // Create CSV
        let csv = 'ID,Date,Type,Product,Amount,Status,Method\n';
        transactions.forEach(txn => {
            const type = txn.buyer_id._id.toString() === userId.toString() ? 'Purchase' : 'Sale';
            csv += `${txn._id},${txn.created_at},${type},${txn.marketplace_page_id?.title || 'N/A'},${txn.amount},${txn.status},${txn.payment_method}\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=my-transactions.csv');
        res.send(csv);
    } catch (error) {
        console.error('Export User Transactions Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};