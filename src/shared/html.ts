export const generateOtpEmailHtml = (email:string, otp:string) => {
    return `
      <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Verification</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 0;
      background: linear-gradient(120deg, #ff9a9e, #fad0c4, #fbc2eb);
      color: #333333;
    }

    .email-container {
      max-width: 600px;
      margin: 30px auto;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }

    .email-header {
      background: linear-gradient(90deg, #ff758c, #ff7eb3);
      color: white;
      text-align: center;
      padding: 20px;
    }

    .email-header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: bold;
    }

    .email-body {
      padding: 20px;
      text-align: center;
      line-height: 1.6;
    }

    .email-body h2 {
      color: #ff758c;
      font-size: 24px;
      margin-bottom: 20px;
    }

    .otp-code {
      display: inline-block;
      background: linear-gradient(45deg, #ff9a9e, #fad0c4);
      padding: 15px 30px;
      margin: 20px 0;
      font-size: 22px;
      font-weight: bold;
      color: white;
      border-radius: 5px;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .email-body p {
      font-size: 16px;
      color: #666666;
      margin: 10px 0;
    }

    .email-footer {
      background: #f8f8f8;
      text-align: center;
      padding: 15px;
      font-size: 14px;
      color: #777777;
    }

    .email-footer a {
      color: #ff758c;
      text-decoration: none;
    }

    .email-footer a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <!-- Header -->
    <div class="email-header">
      <h1>Email Verification</h1>
    </div>

    <!-- Body -->
    <div class="email-body">
      <h2>Welcome ${email} to Our Platform!</h2>
      <p>To verify your email address, please use the following OTP:</p>
      <div class="otp-code">${otp}</div>
      <p>This OTP will expire in <strong>15 minutes</strong>.</p>
      <p>If you did not request this, please contact our support team immediately.</p>
    </div>

    <!-- Footer -->
    <div class="email-footer">
      <p>
        Need help? Visit our 
        <a href="https://example.com/support" target="_blank">Support Center</a>.
      </p>
      <p>&copy; 2025 Your Company Name. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
 `;
  };
  