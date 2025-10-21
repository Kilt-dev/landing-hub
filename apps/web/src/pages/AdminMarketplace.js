import React, { useState, useEffect, useContext } from 'react';
import { UserContext } from '../context/UserContext';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import { jwtDecode } from 'jwt-decode';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import AOS from 'aos';
import 'aos/dist/aos.css';
import '../styles/AdminMarketplace.css';
import DogLoader from '../components/Loader';
import { Check, X, Eye, Star, AlertTriangle, Trash2 } from 'lucide-react';

const AdminMarketplace = () => {
    const { user } = useContext(UserContext);
    const [loading, setLoading] = useState(true);
    const [userRole, setUserRole] = useState(null);
    const [pages, setPages] = useState([]);
    const [stats, setStats] = useState(null);
    const [selectedStatus, setSelectedStatus] = useState('PENDING');
    const [selectedPage, setSelectedPage] = useState(null);
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const navigate = useNavigate();
    const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

    const statusOptions = [
        { value: 'all', label: 'Tất cả' },
        { value: 'PENDING', label: 'Chờ duyệt' },
        { value: 'ACTIVE', label: 'Đã duyệt' },
        { value: 'REJECTED', label: 'Bị từ chối' },
        { value: 'SUSPENDED', label: 'Tạm ngưng' }
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
                if (decodedToken.role !== 'admin') {
                    toast.error('Bạn không có quyền truy cập trang này');
                    navigate('/dashboard');
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

        if (user?.role === 'admin') {
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
        if (userRole === 'admin') {
            loadPages();
            loadStats();
        }
    }, [userRole, selectedStatus]);

    const loadPages = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const url = selectedStatus === 'PENDING'
                ? `${API_BASE_URL}/api/admin/marketplace/pending`
                : `${API_BASE_URL}/api/admin/marketplace/pages${selectedStatus !== 'all' ? `?status=${selectedStatus}` : ''}`;

            const response = await axios.get(url, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setPages(response.data.data || []);
        } catch (err) {
            console.error('Load pages error:', err);
            toast.error('Không thể tải danh sách marketplace pages');
        } finally {
            setLoading(false);
        }
    };

    const loadStats = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_BASE_URL}/api/admin/marketplace/stats`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setStats(response.data.data);
        } catch (err) {
            console.error('Load stats error:', err);
        }
    };

    const handleApprove = async (id) => {
        if (!window.confirm('Bạn có chắc muốn duyệt landing page này?')) return;
        try {
            const token = localStorage.getItem('token');
            await axios.post(
                `${API_BASE_URL}/api/admin/marketplace/pages/${id}/approve`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success('Đã duyệt thành công');
            loadPages();
            loadStats();
        } catch (err) {
            console.error('Approve error:', err);
            toast.error(err.response?.data?.message || 'Không thể duyệt');
        }
    };

    const handleReject = async (id) => {
        const reason = prompt('Nhập lý do từ chối:');
        if (!reason) return;
        try {
            const token = localStorage.getItem('token');
            await axios.post(
                `${API_BASE_URL}/api/admin/marketplace/pages/${id}/reject`,
                { reason },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success('Đã từ chối');
            loadPages();
            loadStats();
        } catch (err) {
            console.error('Reject error:', err);
            toast.error(err.response?.data?.message || 'Không thể từ chối');
        }
    };

    const handleToggleFeatured = async (id) => {
        try {
            const token = localStorage.getItem('token');
            await axios.post(
                `${API_BASE_URL}/api/admin/marketplace/pages/${id}/toggle-featured`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success('Đã cập nhật trạng thái featured');
            loadPages();
        } catch (err) {
            console.error('Toggle featured error:', err);
            toast.error('Không thể cập nhật');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Bạn có chắc muốn xóa landing page này?')) return;
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`${API_BASE_URL}/api/admin/marketplace/pages/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('Đã xóa thành công');
            loadPages();
            loadStats();
        } catch (err) {
            console.error('Delete error:', err);
            toast.error('Không thể xóa');
        }
    };

    const getStatusBadge = (status) => {
        const badges = {
            DRAFT: { color: '#6b7280', label: 'Bản nháp' },
            PENDING: { color: '#f59e0b', label: 'Chờ duyệt' },
            ACTIVE: { color: '#10b981', label: 'Đã duyệt' },
            REJECTED: { color: '#ef4444', label: 'Từ chối' },
            SUSPENDED: { color: '#f97316', label: 'Tạm ngưng' }
        };
        const badge = badges[status] || { color: '#6b7280', label: status };
        return (
            <span className="status-badge" style={{
                backgroundColor: badge.color,
                color: 'white',
                padding: '4px 12px',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: '500'
            }}>
                {badge.label}
            </span>
        );
    };

    const formatPrice = (price) => {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price);
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleString('vi-VN');
    };

    if (loading && !stats) {
        return <DogLoader />;
    }

    return (
        <div className="admin-marketplace-container">
            <Sidebar userRole={userRole} />
            <div className="admin-marketplace-main">
                <Header />
                <div className="admin-marketplace-content">
                    <div className="admin-marketplace-header" data-aos="fade-down">
                        <div>
                            <h1>🛒 Quản lý Marketplace</h1>
                            <p>Duyệt và quản lý các landing page đăng bán</p>
                        </div>
                    </div>

                    {stats && (
                        <div className="stats-grid" data-aos="fade-up">
                            <div className="stat-card">
                                <div className="stat-icon">📦</div>
                                <div className="stat-info">
                                    <div className="stat-value">{stats.totalPages || 0}</div>
                                    <div className="stat-label">Tổng pages</div>
                                </div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-icon">⏳</div>
                                <div className="stat-info">
                                    <div className="stat-value">{stats.pendingPages || 0}</div>
                                    <div className="stat-label">Chờ duyệt</div>
                                </div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-icon">✅</div>
                                <div className="stat-info">
                                    <div className="stat-value">{stats.activePages || 0}</div>
                                    <div className="stat-label">Đang bán</div>
                                </div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-icon">💰</div>
                                <div className="stat-info">
                                    <div className="stat-value">{formatPrice(stats.revenue || 0)}</div>
                                    <div className="stat-label">Doanh thu</div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="filter-section" data-aos="fade-up">
                        <select
                            value={selectedStatus}
                            onChange={(e) => setSelectedStatus(e.target.value)}
                            className="status-filter"
                        >
                            {statusOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="pages-list" data-aos="fade-up">
                        {loading ? (
                            <DogLoader />
                        ) : pages.length === 0 ? (
                            <div className="empty-state">
                                <p>Không có landing page nào</p>
                            </div>
                        ) : (
                            pages.map(page => (
                                <div key={page._id} className="admin-page-item">
                                    <div className="page-image">
                                        <img src={page.main_screenshot || '/placeholder.png'} alt={page.title} />
                                        {page.is_featured && (
                                            <div className="featured-badge">
                                                <Star size={16} fill="gold" color="gold" /> Featured
                                            </div>
                                        )}
                                    </div>
                                    <div className="page-info">
                                        <div className="page-header">
                                            <h3>{page.title}</h3>
                                            {getStatusBadge(page.status)}
                                        </div>
                                        <p className="page-seller">
                                            Người bán: <strong>{page.seller_id?.name || page.seller_id?.email || 'N/A'}</strong>
                                        </p>
                                        <p className="page-category">{page.category}</p>
                                        <p className="page-description">
                                            {page.description?.substring(0, 150)}...
                                        </p>
                                        <div className="page-meta">
                                            <span>👁️ {page.views} views</span>
                                            <span>❤️ {page.likes} likes</span>
                                            <span>🛒 {page.sold_count} sold</span>
                                            <span>⭐ {page.rating.toFixed(1)}</span>
                                        </div>
                                        <p className="page-date">Ngày tạo: {formatDate(page.created_at)}</p>
                                        {page.rejection_reason && (
                                            <div className="rejection-reason">
                                                <AlertTriangle size={16} /> {page.rejection_reason}
                                            </div>
                                        )}
                                    </div>
                                    <div className="page-actions">
                                        <div className="page-price">{formatPrice(page.price)}</div>
                                        <div className="action-buttons">
                                            <button
                                                className="btn-view"
                                                onClick={() => {
                                                    setSelectedPage(page);
                                                    setShowPreviewModal(true);
                                                }}
                                            >
                                                <Eye size={16} /> Xem
                                            </button>
                                            {page.status === 'PENDING' && (
                                                <>
                                                    <button
                                                        className="btn-approve"
                                                        onClick={() => handleApprove(page._id)}
                                                    >
                                                        <Check size={16} /> Duyệt
                                                    </button>
                                                    <button
                                                        className="btn-reject"
                                                        onClick={() => handleReject(page._id)}
                                                    >
                                                        <X size={16} /> Từ chối
                                                    </button>
                                                </>
                                            )}
                                            {page.status === 'ACTIVE' && (
                                                <button
                                                    className="btn-featured"
                                                    onClick={() => handleToggleFeatured(page._id)}
                                                >
                                                    <Star size={16} /> {page.is_featured ? 'Bỏ' : ''} Featured
                                                </button>
                                            )}
                                            <button
                                                className="btn-delete"
                                                onClick={() => handleDelete(page._id)}
                                            >
                                                <Trash2 size={16} /> Xóa
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Preview Modal */}
            {showPreviewModal && selectedPage && (
                <div className="modal-overlay" onClick={() => setShowPreviewModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <h2>{selectedPage.title}</h2>
                        <img src={selectedPage.main_screenshot} alt={selectedPage.title} style={{ width: '100%', marginBottom: '20px' }} />
                        <p><strong>Mô tả:</strong> {selectedPage.description}</p>
                        <p><strong>Danh mục:</strong> {selectedPage.category}</p>
                        <p><strong>Giá:</strong> {formatPrice(selectedPage.price)}</p>
                        <p><strong>Người bán:</strong> {selectedPage.seller_id?.name || selectedPage.seller_id?.email}</p>
                        <button onClick={() => setShowPreviewModal(false)}>Đóng</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminMarketplace;