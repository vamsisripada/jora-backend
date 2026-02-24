import { sendPaymentOtpEmail, sendPaymentOtpSms } from "../utils/email.js";

const intents = new Map();
const refunds = new Map();

const SUPPORTED_METHODS = [
  { id: "card", label: "Credit / Debit Card", currencies: ["INR", "USD"] },
  { id: "upi", label: "UPI", currencies: ["INR"] },
  { id: "netbanking", label: "Net Banking", currencies: ["INR"] },
  { id: "wallet", label: "Wallet", currencies: ["INR", "USD"] },
];

const createId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const generateOtp = () => `${Math.floor(100000 + Math.random() * 900000)}`;
const OTP_TTL_MS = 2 * 60 * 1000;

const maskEmail = (email = "") => {
  if (!email.includes("@")) return "";
  const [local, domain] = email.split("@");
  if (!local) return `***@${domain}`;
  const head = local.slice(0, 2);
  return `${head}${"*".repeat(Math.max(local.length - 2, 1))}@${domain}`;
};

const maskPhone = (phone = "") => {
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 4) return `****${digits}`;
  return `${"*".repeat(Math.max(digits.length - 4, 4))}${digits.slice(-4)}`;
};

const sendOtpForIntent = async (intent) => {
  const otp = generateOtp();
  intent.otpCode = otp;
  intent.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
  intent.otpAttempts = 0;

  const phone = intent?.customer?.phone;
  const email = intent?.customer?.email;

  if (phone) {
    await sendPaymentOtpSms({
      to: phone,
      otp,
      bankName: intent?.metadata?.bankName,
      cardLast4: intent?.metadata?.cardLast4,
      amount: intent.amount,
      currency: intent.currency,
      expiresInMinutes: 2,
    });
    intent.otpChannel = "phone";
    intent.otpDestinationMasked = maskPhone(phone);
    return;
  }

  if (email) {
    await sendPaymentOtpEmail({
      to: email,
      otp,
      bankName: intent?.metadata?.bankName,
      cardLast4: intent?.metadata?.cardLast4,
      amount: intent.amount,
      currency: intent.currency,
      expiresInMinutes: 2,
    });
    intent.otpChannel = "email";
    intent.otpDestinationMasked = maskEmail(email);
  }
};

const decideOutcome = (amount, method, metadata = {}) => {
  const isUpiOrQrCheckout = method === "upi" || metadata.checkoutMode === "qrcode";

  if (isUpiOrQrCheckout) {
    if (metadata.forceStatus === "failed") return "failed";
    return "succeeded";
  }

  if (metadata.forceStatus && ["succeeded", "failed", "requires_action"].includes(metadata.forceStatus)) {
    return metadata.forceStatus;
  }

  if (metadata.cardLast4 === "0002") return "failed";
  if (metadata.cardLast4 === "3155" || metadata.cardLast4 === "3220") return "requires_action";

  if (amount % 13 === 0) return "failed";
  if (amount % 5 === 0) return "requires_action";
  return "succeeded";
};

export const getMethods = (_req, res) => {
  res.json({
    provider: "mockoon-inspired-gateway",
    mode: "sandbox",
    methods: SUPPORTED_METHODS,
  });
};

export const createIntent = (req, res) => {
  const { amount, currency = "INR", method = "card", customer = {}, metadata = {} } = req.body || {};

  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ message: "Valid amount is required" });
  }

  const isMethodSupported = SUPPORTED_METHODS.some((item) => item.id === method);
  if (!isMethodSupported) {
    return res.status(400).json({ message: "Unsupported payment method" });
  }

  const intentId = createId("pi");
  const clientSecret = createId("secret");
  const intent = {
    id: intentId,
    amount: Number(amount),
    currency,
    method,
    status: "created",
    customer,
    metadata,
    clientSecret,
    createdAt: new Date().toISOString(),
    provider: "mockoon-inspired-gateway",
  };

  intents.set(intentId, intent);

  return res.status(201).json(intent);
};

export const getIntentById = (req, res) => {
  const intent = intents.get(req.params.intentId);
  if (!intent) {
    return res.status(404).json({ message: "Payment intent not found" });
  }

  return res.json(intent);
};

export const confirmIntent = async (req, res) => {
  const intent = intents.get(req.params.intentId);
  if (!intent) {
    return res.status(404).json({ message: "Payment intent not found" });
  }

  const status = decideOutcome(intent.amount, intent.method, intent.metadata);
  intent.status = status;
  intent.confirmedAt = new Date().toISOString();

  if (status === "failed") {
    intent.failureCode = "payment_declined";
    intent.failureMessage = "The payment was declined in sandbox simulation";
  }

  if (status === "requires_action") {
    await sendOtpForIntent(intent);
    intent.nextAction = {
      type: "otp",
      hint: intent.otpChannel === "phone" ? "OTP sent to your registered phone number." : "OTP sent to your registered email.",
      channel: intent.otpChannel || "email",
      maskedDestination: intent.otpDestinationMasked || maskEmail(intent?.customer?.email),
      authUrl: `/api/payment-gateway/intents/${intent.id}/authenticate`,
    };
  }

  intents.set(intent.id, intent);
  return res.json(intent);
};

export const authenticateIntent = (req, res) => {
  const intent = intents.get(req.params.intentId);
  if (!intent) {
    return res.status(404).json({ message: "Payment intent not found" });
  }

  if (!["requires_action", "failed"].includes(intent.status)) {
    return res.status(400).json({ message: "Payment intent does not require authentication" });
  }

  const { otp } = req.body || {};
  if (!otp) {
    return res.status(400).json({ message: "OTP is required" });
  }

  if (!intent.otpCode || !intent.otpExpiresAt) {
    return res.status(400).json({ message: "OTP session not initialized. Please retry payment." });
  }

  if (Date.now() > new Date(intent.otpExpiresAt).getTime()) {
    intent.status = "requires_action";
    intent.failureCode = "otp_expired";
    intent.failureMessage = "OTP expired. Please resend OTP and try again.";
    intents.set(intent.id, intent);
    return res.status(400).json(intent);
  }

  intent.otpAttempts = Number(intent.otpAttempts || 0) + 1;
  if (intent.otpAttempts > 5) {
    intent.status = "requires_action";
    intent.failureCode = "too_many_attempts";
    intent.failureMessage = "Too many failed OTP attempts. Please retry payment.";
    intents.set(intent.id, intent);
    return res.status(429).json(intent);
  }

  if (String(otp) === String(intent.otpCode)) {
    intent.status = "succeeded";
    intent.authenticatedAt = new Date().toISOString();
    delete intent.nextAction;
    delete intent.failureCode;
    delete intent.failureMessage;
    delete intent.otpCode;
    delete intent.otpExpiresAt;
    delete intent.otpAttempts;
  } else {
    intent.status = "requires_action";
    intent.failureCode = "authentication_failed";
    intent.failureMessage = "Authentication failed. Invalid OTP.";
  }

  intents.set(intent.id, intent);
  return res.json(intent);
};

export const resendIntentOtp = async (req, res) => {
  const intent = intents.get(req.params.intentId);
  if (!intent) {
    return res.status(404).json({ message: "Payment intent not found" });
  }

  if (!["requires_action", "failed"].includes(intent.status)) {
    return res.status(400).json({ message: "OTP resend is only allowed for pending authentication" });
  }

  intent.status = "requires_action";
  delete intent.failureCode;
  delete intent.failureMessage;

  await sendOtpForIntent(intent);

  intent.nextAction = {
    ...(intent.nextAction || {}),
    type: "otp",
    channel: intent.otpChannel || "email",
    maskedDestination: intent.otpDestinationMasked || maskEmail(intent?.customer?.email),
    authUrl: `/api/payment-gateway/intents/${intent.id}/authenticate`,
  };

  intents.set(intent.id, intent);

  return res.json({
    message: "OTP resent successfully",
    nextAction: intent.nextAction,
    otpExpiresAt: intent.otpExpiresAt,
  });
};

export const createRefund = (req, res) => {
  const { paymentIntentId, amount, reason = "requested_by_customer" } = req.body || {};

  if (!paymentIntentId || !intents.has(paymentIntentId)) {
    return res.status(400).json({ message: "Valid paymentIntentId is required" });
  }

  const intent = intents.get(paymentIntentId);
  if (intent.status !== "succeeded") {
    return res.status(400).json({ message: "Refund allowed only for succeeded payments" });
  }

  const refundAmount = Number(amount || intent.amount);
  if (!Number.isFinite(refundAmount) || refundAmount <= 0 || refundAmount > intent.amount) {
    return res.status(400).json({ message: "Invalid refund amount" });
  }

  const refundId = createId("rf");
  const refund = {
    id: refundId,
    paymentIntentId,
    amount: refundAmount,
    currency: intent.currency,
    reason,
    status: "succeeded",
    createdAt: new Date().toISOString(),
  };

  refunds.set(refundId, refund);

  return res.status(201).json(refund);
};

export const simulateWebhook = (req, res) => {
  const { event = "payment.succeeded", paymentIntentId } = req.body || {};
  const intent = paymentIntentId ? intents.get(paymentIntentId) : null;

  return res.json({
    id: createId("evt"),
    type: event,
    created: new Date().toISOString(),
    livemode: false,
    data: {
      object: intent || null,
    },
  });
};
