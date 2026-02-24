export const sendVerificationEmail = async ({ to, token }) => {
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const verificationUrl = `${baseUrl}/verify-email?token=${token}`;

  console.log(`
  ====================================
  EMAIL VERIFICATION REQUIRED
  ====================================
  To: ${to}
  Verification Link: ${verificationUrl}
  
  Please copy and paste the link above in your browser to verify your email.
  ====================================
  `);
};

export const sendPaymentOtpEmail = async ({ to, otp, bankName, cardLast4, amount, currency, expiresInMinutes = 2 }) => {
  console.log(`
  ====================================
  PAYMENT OTP
  ====================================
  To: ${to}
  OTP: ${otp}
  Bank: ${bankName || "N/A"}
  Card: **** **** **** ${cardLast4 || "XXXX"}
  Amount: ${currency || "INR"} ${amount}
  Expires In: ${expiresInMinutes} minutes

  Use this OTP on the payment verification page.
  ====================================
  `);
};

export const sendPaymentOtpSms = async ({ to, otp, bankName, cardLast4, amount, currency, expiresInMinutes = 2 }) => {
  console.log(`
  ====================================
  PAYMENT OTP SMS
  ====================================
  To Phone: ${to}
  OTP: ${otp}
  Bank: ${bankName || "N/A"}
  Card: **** **** **** ${cardLast4 || "XXXX"}
  Amount: ${currency || "INR"} ${amount}
  Expires In: ${expiresInMinutes} minutes

  Use this OTP on the payment verification page.
  ====================================
  `);
};

