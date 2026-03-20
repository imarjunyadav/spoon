/**
 * SPOON - EMAIL SERVICE
 * 
 * Centralized email service for sending OTP verification
 * and other transactional emails via Nodemailer.
 */

const nodemailer = require('nodemailer');

// Initialize SMTP transporter for email notifications
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD
  }
});

/**
 * Generate HTML email template for OTP verification.
 * 
 * @param {string} otp - 4-digit OTP code
 * @returns {string} HTML email content
 */
function generateOTPEmailTemplate(otp) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #333; margin: 0; font-size: 24px;">SPOON Canteen</h1>
        <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">Email Verification</p>
      </div>
      
      <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; text-align: center;">
        <p style="color: #333; font-size: 16px; margin: 0 0 20px 0;">
          Your verification code is:
        </p>
        
        <div style="background-color: #fff; border: 2px solid #e9ecef; border-radius: 8px; padding: 20px; margin: 0 0 20px 0;">
          <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #333;">
            ${otp}
          </span>
        </div>
        
        <p style="color: #dc3545; font-size: 14px; margin: 0; font-weight: 500;">
          This code expires in 5 minutes
        </p>
      </div>
      
      <div style="margin-top: 30px; text-align: center;">
        <p style="color: #666; font-size: 13px; margin: 0;">
          If you didn't request this code, please ignore this email.
        </p>
        <p style="color: #999; font-size: 12px; margin: 15px 0 0 0;">
          © SPOON Canteen
        </p>
      </div>
    </div>
  `;
}

/**
 * Send OTP verification email.
 * 
 * @param {string} email - Recipient email address
 * @param {string} otp - 4-digit OTP code
 * @returns {Promise<{success: boolean, error?: string}>} Success status or error
 */
async function sendOTPEmail(email, otp) {
  try {
    const htmlContent = generateOTPEmailTemplate(otp);

    // Note: Implicitly handles 10-second timeout via SMTP connection
    const info = await transporter.sendMail({
      from: `"SPOON Canteen" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject: 'SPOON - Your Verification Code',
      html: htmlContent
    });

    console.log(`📧 OTP email sent to ${email}:`, info.messageId);
    return { success: true };

  } catch (err) {
    console.error(`❌ OTP email error for ${email}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Generate HTML email template for Order Ready notification.
 * 
 * @param {string} trackingUrl - URL to track the order
 * @returns {string} HTML email content
 */
function generateOrderReadyTemplate(trackingUrl) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 30px;">
        <p style="color: #000000; font-size: 24px; font-weight: bold; margin: 0;">
          Your food is ready!
        </p>
      </div>
      
      <div style="text-align: center; margin-bottom: 30px;">
        <a href="${trackingUrl}" style="display: block; width: 100%; box-sizing: border-box; background-color: #eb1700; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: bold; padding: 16px 20px; border-radius: 8px; text-align: center;">
          Track & Collect Order
        </a>
      </div>
      
      <div style="text-align: center; margin-bottom: 30px;">
        <p style="color: #666666; font-size: 14px; margin: 0 0 6px 0; font-weight: bold;">
          Reach the counter within 4 mins.
        </p>
        <p style="color: #999999; font-size: 14px; margin: 0 0 6px 0;">
          We keep orders moving so everyone gets served fresh & fast.
        </p>
        <p style="color: #999999; font-size: 14px; margin: 0;">
          Uncollected orders will be cancelled & refunded as Spoon Coins.
        </p>
      </div>
      
      <div style="text-align: center; margin-bottom: 20px;">
        <p style="color: #999999; font-size: 13px; margin: 0;">
          Found a bug or facing an issue? Reach us at 9152116021.
        </p>
      </div>
      
      <div style="border-top: 1px solid #eeeeee; padding-top: 20px; text-align: center;">
        <p style="color: #999999; font-size: 12px; margin: 0;">
          @SPOON
        </p>
      </div>
    </div>
  `;
}

/**
 * Send 'Order Ready' email notification without OTP.
 * 
 * @param {string} email - Recipient email address
 * @param {string} trackingUrl - Tracking URL
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendOrderReadyEmail(email, trackingUrl) {
  try {
    const htmlContent = generateOrderReadyTemplate(trackingUrl);

    const info = await transporter.sendMail({
      from: `"SPOON Canteen" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject: 'Your food is ready at the counter!',
      html: htmlContent
    });

    console.log(`📧 Order Ready email sent to ${email}: ${info.messageId}`);
    return { success: true };

  } catch (err) {
    console.error(`❌ Order Ready email error for ${email}:`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  sendOTPEmail,
  generateOTPEmailTemplate,
  sendOrderReadyEmail,
  generateOrderReadyTemplate,
  transporter
};
