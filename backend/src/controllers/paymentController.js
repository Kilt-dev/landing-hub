const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const MarketplacePage = require('../models/MarketplacePage');
const Page = require('../models/Page');
const paymentService = require('../services/payment/paymentService');
const { v4: uuidv4 } = require('uuid');

/**
 * Tạo transaction và payment URL
 */
exports.createTransaction = async (req, res) => {
    try {
        const userId = req.user.id;
        const { marketplace_page_id, payment_method } = req.body;

        // Validate payment method
        const validMethods = ['MOMO', 'VNPAY', 'SANDBOX'];
        if (!validMethods.includes(payment_method)) {
            return res.status(400).json({
                success: false,
                message: 'Phương thức thanh toán không hợp lệ'
            });
        }

        // Lấy marketplace page
        const marketplacePage = await MarketplacePage.findById(marketplace_page_id)
            .populate('seller_id');

        if (!marketplacePage) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy landing page'
            });
        }

        if (marketplacePage.status !== 'ACTIVE') {
            return res.status(400).json({
                success: false,
                message: 'Landing page không khả dụng'
            });
        }

        // Không cho phép mua page của chính mình
        if (marketplacePage.seller_id._id.toString() === userId.toString()) {
            return res.status(400).json({
                success: false,
                message: 'Bạn không thể mua landing page của chính mình'
            });
        }

        // Kiểm tra user đã mua page này chưa
        const existingPurchase = await Transaction.findOne({
            buyer_id: userId,
            marketplace_page_id: marketplace_page_id,
            status: 'COMPLETED'
        });

        if (existingPurchase) {
            return res.status(400).json({
                success: false,
                message: 'Bạn đã mua landing page này rồi'
            });
        }

        const amount = marketplacePage.price;
        const platformFee = paymentService.calculatePlatformFee(amount);
        const sellerAmount = paymentService.calculateSellerAmount(amount);

        // Tạo transaction
        const transaction = new Transaction({
            _id: uuidv4(),
            marketplace_page_id: marketplace_page_id,
            buyer_id: userId,
            seller_id: marketplacePage.seller_id._id,
            amount: amount,
            platform_fee: platformFee,
            seller_amount: sellerAmount,
            payment_method: payment_method,
            status: 'PENDING',
            ip_address: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
            user_agent: req.headers['user-agent']
        });

        await transaction.save();

        // Tạo payment URL
        const paymentResult = await paymentService.createPayment(
            transaction,
            payment_method,
            transaction.ip_address
        );

        if (!paymentResult.success) {
            // Xóa transaction nếu tạo payment thất bại
            await Transaction.findByIdAndDelete(transaction._id);

            return res.status(500).json({
                success: false,
                message: 'Không thể tạo thanh toán',
                error: paymentResult.error
            });
        }

        res.status(201).json({
            success: true,
            message: 'Tạo giao dịch thành công',
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
 * Check if user has purchased a marketplace page
 */
exports.checkPurchase = async (req, res) => {
    try {
        const userId = req.user.id;
        const { marketplace_page_id } = req.params;

        const transaction = await Transaction.findOne({
            marketplace_page_id: marketplace_page_id,
            buyer_id: userId,
            status: 'COMPLETED'
        });

        res.json({
            success: true,
            hasPurchased: !!transaction,
            transaction: transaction || null
        });
    } catch (error) {
        console.error('Check Purchase Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};