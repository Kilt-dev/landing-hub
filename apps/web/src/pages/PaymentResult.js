import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import '../styles/PaymentResult.css';

const PaymentResult = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [transaction, setTransaction] = useState(null);
    const [loading, setLoading] = useState(true);

    const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
    const transaction_id = searchParams.get('transaction_id');
    const status = searchParams.get('status');

    useEffect(() => {
        if (transaction_id) {
            loadTransaction();
        } else {
            setLoading(false);
        }
    }, [transaction_id]);

    const loadTransaction = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(
                `${API_BASE_URL}/api/payment/transaction/${transaction_id}`,
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );

            setTransaction(response.data.data);
        } catch (err) {
            console.error('Lỗi tải transaction:', err);
        } finally {
            setLoading(false);
        }
    };

    const formatPrice = (price) => {
        return new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND'
        }).format(price);
    };

    if (loading) {
        return (
            <div className="result-container">
                <div className="result-loading">
                    <div className="spinner"></div>
                    <p>Đang xử lý kết quả thanh toán...</p>
                </div>
            </div>
        );
    }

    const isSuccess = status === 'success' && transaction?.status === 'COMPLETED';

    return (
        <div className="result-container">
            <div className={`result-card ${isSuccess ? 'success' : 'failed'}`}>
                {isSuccess ? (
                    <>
                        <div className="result-icon success-icon">✅</div>
                        <h1>Thanh toán thành công!</h1>
                        <p className="result-message">
                            Cảm ơn bạn đã mua landing page. Giao dịch đã được xử lý thành công.
                        </p>

                        {transaction && (
                            <div className="result-details">
                                <h3>Chi tiết giao dịch</h3>
                                <div className="detail-row">
                                    <span>Mã giao dịch:</span>
                                    <span className="detail-value">{transaction._id}</span>
                                </div>
                                <div className="detail-row">
                                    <span>Landing Page:</span>
                                    <span className="detail-value">{transaction.marketplace_page_id?.title}</span>
                                </div>
                                <div className="detail-row">
                                    <span>Số tiền:</span>
                                    <span className="detail-value">{formatPrice(transaction.amount)}</span>
                                </div>
                                <div className="detail-row">
                                    <span>Phương thức:</span>
                                    <span className="detail-value">{transaction.payment_method}</span>
                                </div>
                                <div className="detail-row">
                                    <span>Trạng thái:</span>
                                    <span className="detail-value success-text">Hoàn thành</span>
                                </div>
                            </div>
                        )}

                        <div className="result-actions">
                            <button
                                className="btn-primary"
                                onClick={() => navigate('/pages')}
                            >
                                📄 Xem landing page của tôi
                            </button>
                            <button
                                className="btn-secondary"
                                onClick={() => navigate('/marketplace')}
                            >
                                🏪 Tiếp tục mua sắm
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="result-icon failed-icon">❌</div>
                        <h1>Thanh toán thất bại</h1>
                        <p className="result-message">
                            Rất tiếc, giao dịch của bạn không thành công. Vui lòng thử lại.
                        </p>

                        {transaction && (
                            <div className="result-details">
                                <h3>Thông tin giao dịch</h3>
                                <div className="detail-row">
                                    <span>Mã giao dịch:</span>
                                    <span className="detail-value">{transaction._id}</span>
                                </div>
                                <div className="detail-row">
                                    <span>Trạng thái:</span>
                                    <span className="detail-value failed-text">{transaction.status}</span>
                                </div>
                            </div>
                        )}

                        <div className="result-actions">
                            <button
                                className="btn-primary"
                                onClick={() => transaction && navigate(`/marketplace/${transaction.marketplace_page_id._id}`)}
                            >
                                🔄 Thử lại
                            </button>
                            <button
                                className="btn-secondary"
                                onClick={() => navigate('/marketplace')}
                            >
                                🏪 Quay lại Marketplace
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default PaymentResult;