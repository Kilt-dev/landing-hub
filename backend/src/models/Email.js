const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false, // true cho port 465, false cho port 587
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const sendOrderConfirmation = async (order) => {
    try {
        const marketplacePage = await require('../models/MarketplacePage').findById(order.marketplacePageId);
        if (!marketplacePage) throw new Error('MarketplacePage not found');

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: order.buyerId, // Thay bằng email của buyer (cần populate User)
            subject: 'Xác nhận đặt hàng Landing Page',
            text: `Đơn hàng ${order.orderId} cho ${marketplacePage.title} đã được xác nhận.`,
            html: `<p>Đơn hàng <strong>${order.orderId}</strong> cho <strong>${marketplacePage.title}</strong> đã được xác nhận.</p>`
        };

        await transporter.sendMail(mailOptions);
        console.log('Order confirmation email sent for order:', order.orderId);
    } catch (error) {
        console.error('Error sending order confirmation:', error);
        // Không ném lỗi để không làm gián đoạn flow
    }
};

const sendDeliveryConfirmation = async (order) => {
    try {
        const marketplacePage = await require('../models/MarketplacePage').findById(order.marketplacePageId);
        if (!marketplacePage) throw new Error('MarketplacePage not found');

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: order.buyerId, // Thay bằng email của buyer
            subject: 'Xác nhận giao Landing Page',
            text: `Landing page ${marketplacePage.title} đã được giao cho đơn hàng ${order.orderId}.`,
            html: `<p>Landing page <strong>${marketplacePage.title}</strong> đã được giao cho đơn hàng <strong>${order.orderId}</strong>.</p>`
        };

        await transporter.sendMail(mailOptions);
        console.log('Delivery confirmation email sent for order:', order.orderId);
    } catch (error) {
        console.error('Error sending delivery confirmation:', error);
        // Không ném lỗi
    }
};

module.exports = { sendOrderConfirmation, sendDeliveryConfirmation };