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

