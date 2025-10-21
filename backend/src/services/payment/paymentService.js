const momoService = require('./momoService');
const vnpayService = require('./vnpayService');
const sandboxService = require('./sandboxService');
const Transaction = require('../../models/Transaction');

class PaymentService {
    /**
     * Tạo payment cho transaction
     */
    async createPayment(transaction, paymentMethod, ipAddr) {
        try {
            const { _id: orderId, amount, marketplace_page_id } = transaction;

            const orderInfo = `Thanh toán Landing Page - ${marketplace_page_id}`;

            let result;

            switch (paymentMethod) {
                case 'MOMO':
                    result = await momoService.createPayment({
                        orderId,
                        amount,
                        orderInfo,
                        extraData: JSON.stringify({
                            marketplace_page_id,
                            transaction_id: orderId
                        })
                    });
                    break;

                case 'VNPAY':
                    result = vnpayService.createPaymentUrl({
                        orderId,
                        amount,
                        orderInfo,
                        ipAddr
                    });
                    break;

                case 'SANDBOX':
                    result = await sandboxService.createPayment({
                        orderId,
                        amount,
                        orderInfo,
                        extraData: {
                            marketplace_page_id,
                            transaction_id: orderId
                        }
                    });
                    break;

                default:
                    return {
                        success: false,
                        error: 'Unsupported payment method'
                    };
            }

            if (result.success) {
                // Update transaction with payment info
                transaction.payment_url = result.paymentUrl || result.payUrl;
                transaction.qr_code_url = result.qrCodeUrl;
                transaction.deep_link = result.deeplink;
                transaction.status = 'PROCESSING';
                await transaction.save();
            }

            return result;
        } catch (error) {
            console.error('Payment Service Error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Verify payment callback
     */
    verifyCallback(paymentMethod, data) {
        try {
            switch (paymentMethod) {
                case 'MOMO':
                    return momoService.verifyIPN(data);

                case 'VNPAY':
                    return vnpayService.verifyCallback(data);

                case 'SANDBOX':
                    return sandboxService.verifyIPN(data);

                default:
                    return {
                        valid: false,
                        error: 'Unsupported payment method'
                    };
            }
        } catch (error) {
            console.error('Verify Callback Error:', error.message);
            return {
                valid: false,
                error: error.message
            };
        }
    }

    /**
     * Process payment success
     */
    async processPaymentSuccess(transactionId, paymentData) {
        try {
            const transaction = await Transaction.findById(transactionId)
                .populate('marketplace_page_id')
                .populate('buyer_id')
                .populate('seller_id');

            if (!transaction) {
                throw new Error('Transaction not found');
            }

            if (transaction.status === 'COMPLETED') {
                return {
                    success: true,
                    message: 'Transaction already completed',
                    transaction
                };
            }

            // Mark transaction as paid
            await transaction.markAsPaid(paymentData);

            // Increment sold count on marketplace page
            const MarketplacePage = require('../../models/MarketplacePage');
            const marketplacePage = await MarketplacePage.findById(transaction.marketplace_page_id);

            if (marketplacePage) {
                await marketplacePage.incrementSoldCount();
            }

            // TODO: Create page copy for buyer
            // This will be handled by a separate service

            return {
                success: true,
                message: 'Payment processed successfully',
                transaction
            };
        } catch (error) {
            console.error('Process Payment Success Error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Process refund
     */
    async processRefund(transactionId, reason) {
        try {
            const transaction = await Transaction.findById(transactionId);

            if (!transaction) {
                throw new Error('Transaction not found');
            }

            if (transaction.status !== 'COMPLETED') {
                throw new Error('Can only refund completed transactions');
            }

            // Request refund từ payment gateway
            let result;
            const { payment_method, payment_gateway_transaction_id, amount, _id } = transaction;

            switch (payment_method) {
                case 'MOMO':
                    result = await momoService.refund({
                        orderId: _id,
                        requestId: _id,
                        amount: amount,
                        transId: payment_gateway_transaction_id,
                        description: reason
                    });
                    break;

                case 'VNPAY':
                    // VNPay refund requires transaction date
                    const transactionDate = vnpayService.formatDate(transaction.created_at);
                    result = await vnpayService.refund({
                        orderId: _id,
                        amount: amount,
                        transactionNo: payment_gateway_transaction_id,
                        transactionDate: transactionDate,
                        refundAmount: amount,
                        ipAddr: transaction.ip_address || '127.0.0.1'
                    });
                    break;

                case 'SANDBOX':
                    result = await sandboxService.refund({
                        orderId: _id,
                        amount: amount,
                        description: reason
                    });
                    break;

                default:
                    return {
                        success: false,
                        error: 'Unsupported payment method for refund'
                    };
            }

            if (result.success) {
                // Process refund in transaction
                await transaction.processRefund(result.refundRequestId || result.data.refundTransactionId);

                return {
                    success: true,
                    message: 'Refund processed successfully',
                    transaction
                };
            } else {
                return {
                    success: false,
                    error: result.error || 'Refund failed'
                };
            }
        } catch (error) {
            console.error('Process Refund Error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Calculate platform fee (10% của amount)
     */
    calculatePlatformFee(amount) {
        return Math.floor(amount * 0.1); // 10% platform fee
    }

    /**
     * Calculate seller amount
     */
    calculateSellerAmount(amount) {
        const platformFee = this.calculatePlatformFee(amount);
        return amount - platformFee;
    }
}

module.exports = new PaymentService();