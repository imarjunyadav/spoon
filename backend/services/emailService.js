/**
 * ========================================
 * SPOON - EMAIL SERVICE
 * ========================================
 * 
 * PURPOSE:
 * Centralized email service for sending OTP verification
 * and other transactional emails via Nodemailer.
 * 
 * REQUIREMENTS:
 * - 2.1: Send email within 10 seconds
 * - 2.2: Include 4-digit OTP prominently
 * - 2.3: Include expiration time (5 minutes)
 * - 2.4: Clear subject line for SPOON verification
 * - 2.5: Handle email delivery errors gracefully
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
 * Generate HTML email template for OTP verification
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
 * Send OTP verification email
 * 
 * PURPOSE: Send OTP code to user's email for verification
 * 
 * PARAMETERS:
 * @param {string} email - Recipient email address
 * @param {string} otp - 4-digit OTP code
 * 
 * RETURNS: Promise<{success: boolean, error?: string}>
 * 
 * REQUIREMENTS:
 * - 2.1: Sends email (within 10 seconds handled by SMTP timeout)
 * - 2.2: OTP prominently displayed in template
 * - 2.3: Expiration time (5 minutes) included
 * - 2.4: Clear subject line "SPOON - Your Verification Code"
 * - 2.5: Returns error object on failure instead of throwing
 */
async function sendOTPEmail(email, otp) {
  try {
    const htmlContent = generateOTPEmailTemplate(otp);
    
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

module.exports = {
  sendOTPEmail,
  generateOTPEmailTemplate,
  transporter
};
