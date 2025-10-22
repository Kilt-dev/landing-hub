import React, { useState, useEffect, useContext } from 'react';
import { UserContext } from '../context/UserContext';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import { jwtDecode } from 'jwt-decode';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import AOS from 'aos';
import 'aos/dist/aos.css';
import '../styles/MarketplaceDetail.css';
import DogLoader from '../components/Loader';
import { toast } from 'react-toastify';

const MarketplaceDetail = () => {
    const { user } = useContext(UserContext);
    const { id } = useParams();
    const [loading, setLoading] = useState(true);
    const [userRole, setUserRole] = useState(null);
    const [page, setPage] = useState(null);
    const [error, setError] = useState('');
    const [purchasing, setPurchasing] = useState(false);
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('SANDBOX');
    const [isLiked, setIsLiked] = useState(false);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [hasPurchased, setHasPurchased] = useState(false);
    const [isSeller, setIsSeller] = useState(false);
    const [downloading, setDownloading] = useState(false);

    const navigate = useNavigate();
    const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

    const paymentMethods = [
        { value: 'SANDBOX', label: '💳 Sandbox (Test)', description: 'Môi trường test thanh toán' },
        { value: 'MOMO', label: '📱 MOMO', description: 'Thanh toán qua ví MOMO' },
        { value: 'VNPAY', label: '🏦 VNPay', description: 'Thanh toán qua VNPay' }
    ];

    useEffect(() => {
        const initializeAuth = async () => {
            const token = localStorage.getItem('token');
            if (!token) {
                navigate('/auth');
                setLoading(false);
                return;
            }
            try {
                const decodedToken = jwtDecode(token);
                if (!decodedToken.role || !decodedToken.userId) {
                    navigate('/auth');
                    setLoading(false);
                    return;
                }
                setUserRole(decodedToken.role);
            } catch (err) {
                console.error('Lỗi giải mã token:', err);
                navigate('/auth');
            } finally {
                setLoading(false);
            }
        };

        if (user?.role) {
            setUserRole(user.role);
            setLoading(false);
        } else {
            initializeAuth();
        }
    }, [user, navigate]);

    useEffect(() => {
        AOS.init({ duration: 600, once: true });
    }, []);

    useEffect(() => {
        if (userRole && id) {
            loadPageDetail();
        }
    }, [userRole, id]);

    const loadPageDetail = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_BASE_URL}/api/marketplace/${id}`);
            setPage(response.data.data);

            // Check if user liked this page
            const decoded = jwtDecode(token);
            const userId = decoded.userId;
            setIsLiked(response.data.data.liked_by?.includes(userId));

            // Check if user is the seller
            setIsSeller(response.data.data.seller_id?._id === userId);

            // Check if user has purchased this page
            await checkPurchaseStatus();

            setError('');
        } catch (err) {
            console.error('Lỗi tải chi tiết:', err);
            setError('Không thể tải chi tiết landing page: ' + (err.response?.data?.message || err.message));
        } finally {
            setLoading(false);
        }
    };
    const checkPurchaseStatus = async () => {
        try {
            const token = localStorage.getItem('token');
            console.log('Check Purchase Token:', token);
            if (!token) {
                console.log('No token found for check-purchase');
                setHasPurchased(false);
                return;
            }
            const response = await axios.get(
                `${API_BASE_URL}/api/payment/check-purchase/${id}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setHasPurchased(response.data.hasPurchased || false);
        } catch (err) {
            console.error('Lỗi kiểm tra mua hàng:', err);
            setHasPurchased(false);
        }
    };

    const handlePurchase = async () => {
        try {
            setPurchasing(true);
            const token = localStorage.getItem('token');
            console.log('Purchase Token:', token);
            if (!token) {
                toast.error('Vui lòng đăng nhập để mua hàng');
                navigate('/auth');
                return;
            }
            const response = await axios.post(
                `${API_BASE_URL}/api/payment/create-transaction`,
                { marketplace_page_id: id, payment_method: selectedPaymentMethod },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (response.data.success) {
                const { payment_url, transaction_id } = response.data.data;
                if (selectedPaymentMethod === 'SANDBOX') {
                    navigate(`/payment/sandbox?transaction_id=${transaction_id}`);
                } else {
                    window.location.href = payment_url;
                }
            } else {
                toast.error(response.data.message);
            }
        } catch (err) {
            console.error('Lỗi mua hàng:', err);
            toast.error(err.response?.data?.message || 'Không thể tạo giao dịch');
        } finally {
            setPurchasing(false);
        }
    };

    const handleLike = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.post(
                `${API_BASE_URL}/api/marketplace/${id}/like`,
                {},
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );

            if (response.data.success) {
                setIsLiked(response.data.data.liked);
                setPage({ ...page, likes: response.data.data.likes });
                toast.success(response.data.data.liked ? 'Đã thích' : 'Đã bỏ thích');
            }
        } catch (err) {
            console.error('Lỗi like:', err);
            toast.error('Không thể cập nhật trạng thái like');
        }
    };

    const handleDemoClick = () => {
        if (page.demo_url) {
            window.open(page.demo_url, '_blank');
        }
    };

    const handleDownload = async (format) => {
        try {
            setDownloading(true);
            const token = localStorage.getItem('token');

            const endpoint = format === 'html'
                ? `${API_BASE_URL}/api/marketplace/${id}/download/html`
                : `${API_BASE_URL}/api/marketplace/${id}/download/iuhpage`;

            const response = await axios.get(endpoint, {
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob'
            });

            // Create download link
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', format === 'html' ? `${page.title}.zip` : `${page.title}.iuhpage`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            toast.success(`Đã tải xuống định dạng ${format.toUpperCase()}`);
        } catch (err) {
            console.error('Lỗi tải xuống:', err);
            toast.error('Không thể tải xuống file');
        } finally {
            setDownloading(false);
        }
    };

    const formatPrice = (price) => {
        if (price === 0) return 'Miễn phí';
        return new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND'
        }).format(price);
    };

    const calculateDiscount = (price, originalPrice) => {
        if (!originalPrice || originalPrice <= price) return 0;
        return Math.round(((originalPrice - price) / originalPrice) * 100);
    };

    if (loading) {
        return <DogLoader />;
    }

    if (error) {
        return (
            <div className="marketplace-detail-container">
                <Sidebar userRole={userRole} />
                <div className="marketplace-detail-main">
                    <Header />
                    <div className="error-container">
                        <h2>❌ Lỗi</h2>
                        <p>{error}</p>
                        <button onClick={() => navigate('/marketplace')}>Quay lại Marketplace</button>
                    </div>
                </div>
            </div>
        );
    }

    if (!page) {
        return null;
    }

    const discount = calculateDiscount(page.price, page.original_price);

    return (
        <div className="marketplace-detail-container">
            <Sidebar userRole={userRole} />
            <div className="marketplace-detail-main">
                <Header />
                <div className="marketplace-detail-content">
                    {/* Breadcrumb */}
                    <div className="breadcrumb" data-aos="fade-down">
                        <span onClick={() => navigate('/marketplace')}>Marketplace</span>
                        <span className="separator">›</span>
                        <span>{page.category}</span>
                        <span className="separator">›</span>
                        <span className="current">{page.title}</span>
                    </div>

                    <div className="detail-grid">
                        {/* Left Column - Images */}
                        <div className="detail-left" data-aos="fade-right">
                            <div className="main-image">
                                <img
                                    src={page.screenshots[currentImageIndex] || page.main_screenshot || '/placeholder.png'}
                                    alt={page.title}
                                />
                                {page.is_bestseller && (
                                    <div className="bestseller-badge">🔥 Bán chạy</div>
                                )}
                                {discount > 0 && (
                                    <div className="discount-badge">-{discount}%</div>
                                )}
                            </div>

                            {page.screenshots && page.screenshots.length > 1 && (
                                <div className="thumbnail-gallery">
                                    {page.screenshots.map((screenshot, index) => (
                                        <div
                                            key={index}
                                            className={`thumbnail ${index === currentImageIndex ? 'active' : ''}`}
                                            onClick={() => setCurrentImageIndex(index)}
                                        >
                                            <img src={screenshot} alt={`Screenshot ${index + 1}`} />
                                        </div>
                                    ))}
                                </div>
                            )}

                            {page.demo_url && (
                                <button className="demo-btn" onClick={handleDemoClick}>
                                    🚀 Xem Demo Live
                                </button>
                            )}
                        </div>

                        {/* Right Column - Details */}
                        <div className="detail-right" data-aos="fade-left">
                            <div className="detail-header">
                                <div className="category-badge">{page.category}</div>
                                <h1>{page.title}</h1>

                                <div className="meta-info">
                                    <span>👁️ {page.views} lượt xem</span>
                                    <span>🛒 {page.sold_count} đã bán</span>
                                    <span>⭐ {page.rating.toFixed(1)} ({page.review_count} đánh giá)</span>
                                </div>

                                <div className="seller-info">
                                    <span>👤 Người bán:</span>
                                    <strong>{page.seller_id?.name || 'Anonymous'}</strong>
                                </div>
                            </div>

                            <div className="price-section">
                                <div className="price-box">
                                    <div className="current-price">{formatPrice(page.price)}</div>
                                    {page.original_price && (
                                        <div className="original-price">{formatPrice(page.original_price)}</div>
                                    )}
                                    {discount > 0 && (
                                        <div className="savings">Tiết kiệm {discount}%</div>
                                    )}
                                </div>

                                <button
                                    className={`like-btn ${isLiked ? 'liked' : ''}`}
                                    onClick={handleLike}
                                >
                                    {isLiked ? '❤️' : '🤍'} {page.likes}
                                </button>
                            </div>

                            <div className="description-section">
                                <h3>📝 Mô tả</h3>
                                <p>{page.description}</p>
                            </div>

                            <div className="features-section">
                                <h3>✨ Tính năng</h3>
                                <div className="features-grid">
                                    {page.responsive && (
                                        <div className="feature-item">
                                            <span className="feature-icon">📱</span>
                                            <span>Responsive Design</span>
                                        </div>
                                    )}
                                    {page.customizable && (
                                        <div className="feature-item">
                                            <span className="feature-icon">🎨</span>
                                            <span>Có thể tùy chỉnh</span>
                                        </div>
                                    )}
                                    <div className="feature-item">
                                        <span className="feature-icon">⚡</span>
                                        <span>Tải nhanh</span>
                                    </div>
                                    <div className="feature-item">
                                        <span className="feature-icon">🔒</span>
                                        <span>An toàn & bảo mật</span>
                                    </div>
                                </div>
                            </div>

                            {page.tags && page.tags.length > 0 && (
                                <div className="tags-section">
                                    <h3>🏷️ Tags</h3>
                                    <div className="tags">
                                        {page.tags.map((tag, index) => (
                                            <span key={index} className="tag">{tag}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Download Section - Show if purchased or is seller */}
                            {(hasPurchased || isSeller) && (
                                <div className="download-section">
                                    <h3>📥 Tải xuống Landing Page</h3>
                                    <p className="download-info">
                                        {isSeller ? 'Bạn là người bán, có thể tải xuống template của mình' : 'Bạn đã mua landing page này, có thể tải xuống ngay'}
                                    </p>

                                    <div className="download-options">
                                        <div className="download-option">
                                            <div className="option-header">
                                                <span className="option-icon">📦</span>
                                                <div className="option-info">
                                                    <h4>HTML + Images (ZIP)</h4>
                                                    <p>Tải về file HTML và tất cả hình ảnh để deploy</p>
                                                </div>
                                            </div>
                                            <button
                                                className="download-btn"
                                                onClick={() => handleDownload('html')}
                                                disabled={downloading}
                                            >
                                                {downloading ? '⏳ Đang tải...' : '📥 Tải ZIP'}
                                            </button>
                                        </div>

                                        <div className="download-option">
                                            <div className="option-header">
                                                <span className="option-icon">📄</span>
                                                <div className="option-info">
                                                    <h4>.iuhpage (Import File)</h4>
                                                    <p>Tải về file .iuhpage để import vào editor</p>
                                                </div>
                                            </div>
                                            <button
                                                className="download-btn"
                                                onClick={() => handleDownload('iuhpage')}
                                                disabled={downloading}
                                            >
                                                {downloading ? '⏳ Đang tải...' : '📥 Tải .iuhpage'}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="download-note">
                                        <p>💡 <strong>Lưu ý:</strong></p>
                                        <ul>
                                            <li>File ZIP chứa HTML + images để deploy lên hosting</li>
                                            <li>File .iuhpage để import vào editor và chỉnh sửa</li>
                                            <li>Bạn có thể tải xuống nhiều lần không giới hạn</li>
                                        </ul>
                                    </div>
                                </div>
                            )}

                            {/* Payment Section - Show if NOT purchased and NOT seller */}
                            {!hasPurchased && !isSeller && (
                                <div className="payment-section">
                                    <h3>💳 Chọn phương thức thanh toán</h3>
                                    <div className="payment-methods">
                                        {paymentMethods.map((method) => (
                                            <div
                                                key={method.value}
                                                className={`payment-method ${selectedPaymentMethod === method.value ? 'selected' : ''}`}
                                                onClick={() => setSelectedPaymentMethod(method.value)}
                                            >
                                                <div className="method-header">
                                                    <span className="method-label">{method.label}</span>
                                                    <span className="radio">{selectedPaymentMethod === method.value ? '⚫' : '⚪'}</span>
                                                </div>
                                                <div className="method-description">{method.description}</div>
                                            </div>
                                        ))}
                                    </div>

                                    <button
                                        className="purchase-btn"
                                        onClick={handlePurchase}
                                        disabled={purchasing}
                                    >
                                        {purchasing ? '⏳ Đang xử lý...' : '🛒 Mua ngay'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MarketplaceDetail;