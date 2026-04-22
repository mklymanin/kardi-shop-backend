"use strict";

const { randomUUID } = require("node:crypto");
const {
  sendOrderCreatedEmail,
  sendOrderPaymentReminderEmail,
} = require("../../../services/notifications/email");

const YOOKASSA_API_URL = "https://api.yookassa.ru/v3";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const YOOKASSA_REQUEST_TIMEOUT_MS = Number(
  process.env.YOOKASSA_REQUEST_TIMEOUT_MS || 10000
);

class CheckoutValidationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "CheckoutValidationError";
    this.code = code;
  }
}

class CheckoutBusinessError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "CheckoutBusinessError";
    this.code = code;
  }
}

class CheckoutPaymentConfigError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "CheckoutPaymentConfigError";
    this.code = code;
  }
}

class CheckoutPaymentProviderError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "CheckoutPaymentProviderError";
    this.code = code;
  }
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeCode(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeLineType(value) {
  const t = normalizeText(value).toLowerCase();
  if (t === "rent") {
    return "rent";
  }
  return "purchase";
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function toMoneyNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100) / 100;
}

function toMoneyString(value) {
  return toMoneyNumber(value).toFixed(2);
}

function toNonNegativeInt(value) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }
  return n;
}

function getYooKassaAuthHeader() {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) {
    throw new CheckoutPaymentConfigError(
      "Онлайн-оплата временно недоступна: провайдер оплаты не настроен",
      "PAYMENT_PROVIDER_NOT_CONFIGURED"
    );
  }
  return `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString("base64")}`;
}

async function yookassaRequest(path, init) {
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", getYooKassaAuthHeader());
  headers.set("Content-Type", "application/json");
  if (init.idempotenceKey) {
    headers.set("Idempotence-Key", init.idempotenceKey);
  }

  let response;
  try {
    response = await fetch(`${YOOKASSA_API_URL}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(YOOKASSA_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const isTimeoutError =
      error?.name === "AbortError" || error?.name === "TimeoutError";
    const isNetworkError =
      error?.message === "fetch failed" ||
      error?.cause?.code === "UND_ERR_CONNECT_TIMEOUT";

    if (isTimeoutError || isNetworkError) {
      throw new CheckoutPaymentProviderError(
        "Платежный провайдер временно недоступен. Попробуйте снова",
        "PAYMENT_PROVIDER_UNAVAILABLE"
      );
    }

    throw error;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    strapi.log.error(`[checkout:yookassa] ${response.status} ${path} ${body}`);
    throw new CheckoutPaymentProviderError(
      "Платежный провайдер временно недоступен. Попробуйте снова",
      "PAYMENT_PROVIDER_UNAVAILABLE"
    );
  }

  return response.json();
}

function getReturnUrl(orderPublicId) {
  const url = new URL("/checkout/success", SITE_URL);
  url.searchParams.set("order", String(orderPublicId));
  return url.toString();
}

function mapYooKassaStatusToPaymentStatus(status) {
  switch (status) {
    case "succeeded":
      return "paid";
    case "waiting_for_capture":
      return "waiting_for_capture";
    case "canceled":
      return "canceled";
    default:
      return "pending";
  }
}

function validatePayload(payload) {
  const customerName = normalizeText(payload.customerName);
  const phone = normalizeText(payload.phone);
  const email = normalizeText(payload.email);
  const comment = normalizeText(payload.comment) || undefined;
  const deliveryMethodCode = normalizeText(payload.deliveryMethodCode);
  const deliveryAddress = normalizeText(payload.deliveryAddress) || undefined;
  const couponCode = normalizeCode(payload.couponCode) || undefined;
  const inputItems = Array.isArray(payload.items) ? payload.items : [];

  if (customerName.length < 2) {
    throw new CheckoutValidationError(
      'Поле "Имя" заполнено некорректно',
      "INVALID_CUSTOMER_NAME"
    );
  }
  if (phone.length < 5) {
    throw new CheckoutValidationError(
      'Поле "Телефон" заполнено некорректно',
      "INVALID_PHONE"
    );
  }
  if (!email || !isValidEmail(email)) {
    throw new CheckoutValidationError(
      'Поле "Email" заполнено некорректно',
      "INVALID_EMAIL"
    );
  }
  if (!deliveryMethodCode) {
    throw new CheckoutValidationError(
      "Не выбран способ получения",
      "INVALID_DELIVERY_METHOD"
    );
  }
  if (!inputItems.length) {
    throw new CheckoutValidationError("Корзина пуста", "EMPTY_CART");
  }

  const items = inputItems.map((item) => ({
    slug: normalizeText(item.slug),
    quantity: Math.max(1, Math.trunc(Number(item.quantity) || 0)),
    lineType: normalizeLineType(item.lineType),
  }));

  if (items.some((item) => !item.slug)) {
    throw new CheckoutValidationError(
      "Некорректный состав корзины",
      "INVALID_ITEMS"
    );
  }

  return {
    customerName,
    phone,
    email,
    comment,
    deliveryMethodCode,
    deliveryAddress,
    couponCode,
    items,
  };
}

async function fetchProductsBySlugs(slugs) {
  const products = await strapi.entityService.findMany("api::product.product", {
    fields: [
      "slug",
      "title",
      "price",
      "stock",
      "rentalAvailable",
      "rentalPrice",
      "rentalPeriodLabel",
    ],
    filters: {
      slug: { $in: slugs },
      isPublishedToStore: { $eq: true },
    },
    populate: {
      deliveryMethods: {
        fields: ["code"],
      },
    },
    publicationState: "live",
    limit: slugs.length + 10,
  });

  const bySlug = new Map();
  for (const product of products || []) {
    if (product.slug) {
      bySlug.set(product.slug, product);
    }
  }
  return bySlug;
}

async function getActiveDeliveryMethod(deliveryMethodCode) {
  const methods = await strapi.entityService.findMany(
    "api::delivery-method.delivery-method",
    {
      fields: ["code", "title", "price", "pickupAddress"],
      filters: {
        code: { $eq: deliveryMethodCode },
        isActive: { $eq: true },
      },
      limit: 1,
    }
  );
  return methods?.[0];
}

async function getActiveCoupon(code) {
  if (!code) return null;

  const coupons = await strapi.entityService.findMany("api::coupon.coupon", {
    fields: [
      "code",
      "isActive",
      "discountType",
      "discountValue",
      "startsAt",
      "expiresAt",
    ],
    filters: {
      code: { $eq: code },
    },
    limit: 1,
  });

  const coupon = coupons?.[0];
  if (!coupon) {
    throw new CheckoutBusinessError("Купон не найден", "COUPON_NOT_FOUND");
  }
  if (!coupon.isActive) {
    throw new CheckoutBusinessError("Купон неактивен", "COUPON_INACTIVE");
  }

  const now = new Date();
  if (coupon.startsAt && new Date(coupon.startsAt) > now) {
    throw new CheckoutBusinessError(
      "Купон ещё не начал действовать",
      "COUPON_NOT_STARTED"
    );
  }
  if (coupon.expiresAt && new Date(coupon.expiresAt) < now) {
    throw new CheckoutBusinessError(
      "Срок действия купона истек",
      "COUPON_EXPIRED"
    );
  }

  return coupon;
}

async function createYooKassaPayment({
  amountValue,
  description,
  orderDocumentId,
  orderPublicId,
}) {
  return yookassaRequest("/payments", {
    method: "POST",
    idempotenceKey: randomUUID(),
    body: JSON.stringify({
      amount: {
        value: amountValue,
        currency: "RUB",
      },
      payment_method_data: {
        type: "bank_card",
      },
      confirmation: {
        type: "redirect",
        return_url: getReturnUrl(orderPublicId),
      },
      capture: true,
      description,
      metadata: {
        orderDocumentId,
        orderPublicId,
      },
    }),
  });
}

function getPaymentExpiryDate(payment) {
  const raw = payment?.expires_at || payment?.expiresAt;
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

async function persistPaymentForOrder(orderId, payment) {
  const confirmationUrl = payment?.confirmation?.confirmation_url;
  if (!confirmationUrl) {
    throw new Error("YooKassa did not return confirmation_url");
  }

  await strapi.entityService.update("api::order.order", orderId, {
    data: {
      paymentId: payment.id,
      paymentUrl: confirmationUrl,
      paymentStatus: mapYooKassaStatusToPaymentStatus(payment.status),
      paymentExpiresAt: getPaymentExpiryDate(payment),
      lastPaymentAttemptAt: new Date().toISOString(),
    },
  });

  return confirmationUrl;
}

async function createAndPersistOrderPayment({
  orderId,
  orderDocumentId,
  orderPublicId,
  amountValue,
}) {
  const payment = await createYooKassaPayment({
    amountValue,
    description: `Заказ #${orderPublicId}`,
    orderDocumentId,
    orderPublicId: String(orderPublicId),
  });

  const confirmationUrl = await persistPaymentForOrder(orderId, payment);
  return {
    payment,
    confirmationUrl,
  };
}

async function sendOrderEmailSafe(sender, payload, logContext) {
  try {
    await sender(payload);
  } catch (error) {
    strapi.log.error(`[checkout] ${logContext} failed`, error);
  }
}

async function getOrderByResumeToken(resumeToken) {
  const found = await strapi.entityService.findMany("api::order.order", {
    fields: [
      "customerName",
      "email",
      "itemsRaw",
      "total",
      "deliveryMethodCode",
      "deliveryMethodTitle",
      "status",
      "paymentStatus",
      "paymentUrl",
      "paymentId",
      "resumeToken",
      "documentId",
      "paymentExpiresAt",
    ],
    filters: {
      resumeToken: { $eq: resumeToken },
    },
    limit: 1,
  });

  return found?.[0] || null;
}

async function buildCheckoutQuote(payload) {
  const validated = validatePayload(payload);
  const deliveryMethod = await getActiveDeliveryMethod(
    validated.deliveryMethodCode
  );
  if (!deliveryMethod) {
    throw new CheckoutBusinessError(
      "Выбранный способ получения недоступен",
      "DELIVERY_METHOD_NOT_AVAILABLE"
    );
  }

  const needsAddress =
    deliveryMethod.code === "courier" || deliveryMethod.code === "russian_post";
  if (needsAddress && !validated.deliveryAddress) {
    throw new CheckoutValidationError(
      "Для выбранного способа получения требуется адрес доставки",
      "DELIVERY_ADDRESS_REQUIRED"
    );
  }

  const productMap = await fetchProductsBySlugs(
    validated.items.map((item) => item.slug)
  );
  const lines = validated.items.map((item) => {
    const product = productMap.get(item.slug);
    if (!product) {
      throw new CheckoutBusinessError(
        `Товар "${item.slug}" не найден`,
        "PRODUCT_NOT_FOUND"
      );
    }

    const isRent = item.lineType === "rent";
    let price;
    let rentalPeriodLabel = null;

    if (isRent) {
      if (!product.rentalAvailable) {
        throw new CheckoutBusinessError(
          `Товар "${product.title || product.slug}" недоступен для аренды`,
          "PRODUCT_RENTAL_NOT_AVAILABLE"
        );
      }
      price = toMoneyNumber(product.rentalPrice);
      if (!price || price <= 0) {
        throw new CheckoutBusinessError(
          `У товара "${item.slug}" не задана цена аренды`,
          "PRODUCT_RENTAL_PRICE_INVALID"
        );
      }
      const label = normalizeText(product.rentalPeriodLabel);
      rentalPeriodLabel = label || null;
    } else {
      price = toMoneyNumber(product.price);
      if (!price || price <= 0) {
        throw new CheckoutBusinessError(
          `У товара "${item.slug}" не задана цена`,
          "PRODUCT_PRICE_INVALID"
        );
      }
    }

    const allowedCodes = (product.deliveryMethods || [])
      .map((method) => normalizeText(method?.code))
      .filter(Boolean);
    if (
      allowedCodes.length > 0 &&
      !allowedCodes.includes(deliveryMethod.code)
    ) {
      throw new CheckoutBusinessError(
        `Товар "${product.title || product.slug}" нельзя оформить со способом "${deliveryMethod.title}"`,
        "PRODUCT_DELIVERY_NOT_ALLOWED"
      );
    }

    const stock = toNonNegativeInt(product.stock);
    if (item.quantity > stock) {
      throw new CheckoutBusinessError(
        `Недостаточно товара «${product.title || product.slug}» на складе`,
        "INSUFFICIENT_STOCK"
      );
    }

    const line = {
      slug: item.slug,
      title: String(product.title || product.slug || item.slug),
      quantity: item.quantity,
      price,
      lineType: item.lineType,
    };
    if (isRent && rentalPeriodLabel) {
      line.rentalPeriodLabel = rentalPeriodLabel;
    }
    return line;
  });

  const subtotalBeforeDiscount = toMoneyNumber(
    lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
  );
  const coupon = await getActiveCoupon(validated.couponCode);
  let discountAmount = 0;
  let discountType = null;
  let discountValue = null;
  let subtotalAfterDiscount = subtotalBeforeDiscount;

  if (coupon) {
    discountType = coupon.discountType;
    discountValue = toMoneyNumber(coupon.discountValue);
    if (discountType === "percent") {
      discountAmount = toMoneyNumber(
        (subtotalBeforeDiscount * discountValue) / 100
      );
    } else {
      discountAmount = toMoneyNumber(discountValue);
    }

    if (discountAmount > subtotalBeforeDiscount) {
      discountAmount = subtotalBeforeDiscount;
    }
    subtotalAfterDiscount = toMoneyNumber(
      subtotalBeforeDiscount - discountAmount
    );
  }

  const deliveryPrice = toMoneyNumber(deliveryMethod.price);
  const total = toMoneyNumber(subtotalAfterDiscount + deliveryPrice);

  return {
    validated,
    deliveryMethod,
    needsAddress,
    lines,
    coupon,
    pricingSnapshot: {
      subtotal: subtotalBeforeDiscount,
      subtotalBeforeDiscount,
      subtotalAfterDiscount,
      delivery: deliveryPrice,
      discount: discountAmount,
      total,
      couponApplied: Boolean(coupon),
      couponCode: coupon?.code || null,
      discountType: discountType || null,
      discountValue:
        typeof discountValue === "number" ? toMoneyNumber(discountValue) : null,
    },
  };
}

module.exports = () => ({
  async startCheckout(payload) {
    const quote = await buildCheckoutQuote(payload);
    const {
      validated,
      deliveryMethod,
      needsAddress,
      lines,
      coupon,
      pricingSnapshot,
    } = quote;
    const {
      subtotalBeforeDiscount,
      subtotalAfterDiscount,
      delivery: deliveryPrice,
      discount: discountAmount,
      total,
      discountType,
      discountValue,
    } = pricingSnapshot;

    const createdOrder = await strapi.entityService.create("api::order.order", {
      data: {
        customerName: validated.customerName,
        phone: validated.phone,
        email: validated.email,
        comment: validated.comment,
        itemsRaw: lines,
        subtotal: toMoneyString(subtotalAfterDiscount),
        subtotalBeforeDiscount: toMoneyString(subtotalBeforeDiscount),
        subtotalAfterDiscount: toMoneyString(subtotalAfterDiscount),
        deliveryMethodCode: deliveryMethod.code,
        deliveryMethodTitle: deliveryMethod.title,
        deliveryAddress: needsAddress ? validated.deliveryAddress : null,
        deliveryPrice: toMoneyString(deliveryPrice),
        total: toMoneyString(total),
        couponCode: coupon?.code || null,
        discountType: discountType || null,
        discountValue:
          typeof discountValue === "number"
            ? toMoneyString(discountValue)
            : null,
        discountAmount: toMoneyString(discountAmount),
        currency: "RUB",
        status: "new",
        paymentStatus: "pending",
        paymentProvider: "yookassa",
        resumeToken: randomUUID(),
      },
    });

    const orderId = createdOrder?.id;
    const orderDocumentId = createdOrder?.documentId;
    const resumeToken = createdOrder?.resumeToken;
    if (!orderId || !orderDocumentId) {
      throw new Error("Failed to create order");
    }
    if (!resumeToken) {
      throw new Error("Failed to create resume token");
    }

    const { confirmationUrl } = await createAndPersistOrderPayment({
      orderId,
      orderDocumentId,
      orderPublicId: String(orderId),
      amountValue: toMoneyString(total),
    });
    await sendOrderEmailSafe(
      sendOrderCreatedEmail,
      {
        orderId,
        customerName: validated.customerName,
        email: validated.email,
        itemsRaw: lines,
        total,
        deliveryMethodCode: deliveryMethod.code,
        deliveryMethodTitle: deliveryMethod.title,
        paymentUrl: confirmationUrl,
      },
      "send order created email"
    );

    return {
      orderId,
      resumeToken,
      confirmationUrl,
      pricingSnapshot,
    };
  },
  async resumeCheckout(payload) {
    const resumeToken = normalizeText(payload.resumeToken);
    if (!resumeToken) {
      throw new CheckoutValidationError(
        "Не передан ключ возобновления оплаты",
        "RESUME_TOKEN_REQUIRED"
      );
    }

    const order = await getOrderByResumeToken(resumeToken);
    if (!order?.id || !order?.documentId) {
      throw new CheckoutBusinessError(
        "Заказ для возобновления не найден",
        "ORDER_NOT_FOUND"
      );
    }

    if (order.paymentStatus === "paid") {
      return {
        orderId: order.id,
        paymentStatus: order.paymentStatus,
        confirmationUrl: null,
      };
    }

    if (order.status === "cancelled") {
      throw new CheckoutBusinessError(
        "Заказ отменен и недоступен для оплаты",
        "ORDER_CANCELLED"
      );
    }

    if (
      order.paymentStatus === "pending" &&
      normalizeText(order.paymentUrl) &&
      order.paymentStatus !== "canceled"
    ) {
      return {
        orderId: order.id,
        paymentStatus: order.paymentStatus,
        confirmationUrl: order.paymentUrl,
      };
    }

    const { confirmationUrl, payment } = await createAndPersistOrderPayment({
      orderId: order.id,
      orderDocumentId: order.documentId,
      orderPublicId: String(order.id),
      amountValue: toMoneyString(order.total),
    });

    if (payment?.id) {
      await sendOrderEmailSafe(
        sendOrderPaymentReminderEmail,
        {
          orderId: order.id,
          customerName: order.customerName,
          email: order.email,
          total: toMoneyNumber(order.total),
          paymentUrl: confirmationUrl,
        },
        "send order payment reminder email"
      );
    }

    return {
      orderId: order.id,
      paymentStatus: "pending",
      confirmationUrl,
    };
  },
  async quoteCheckout(payload) {
    const { pricingSnapshot } = await buildCheckoutQuote(payload);
    return { pricingSnapshot };
  },
});
