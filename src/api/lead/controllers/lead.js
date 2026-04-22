"use strict";

const { createCoreController } = require("@strapi/strapi").factories;

function normalizeText(value) {
  return String(value ?? "").trim();
}

function toNonNegativeInt(value) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }
  return n;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function validatePreorderRequest(strapi, data) {
  const name = normalizeText(data.name);
  const phone = normalizeText(data.phone);
  const email = normalizeText(data.email);
  const productSlug = normalizeText(data.productSlug);
  if (name.length < 2) {
    const err = new Error("Некорректное имя");
    err.code = "INVALID_NAME";
    throw err;
  }
  if (phone.length < 5) {
    const err = new Error("Некорректный телефон");
    err.code = "INVALID_PHONE";
    throw err;
  }
  if (email && !isValidEmail(email)) {
    const err = new Error("Некорректный email");
    err.code = "INVALID_EMAIL";
    throw err;
  }
  if (!productSlug) {
    const err = new Error("Не указан товар");
    err.code = "PRODUCT_SLUG_REQUIRED";
    throw err;
  }

  const products = await strapi.entityService.findMany("api::product.product", {
    filters: {
      slug: { $eq: productSlug },
      isPublishedToStore: { $eq: true },
    },
    fields: ["slug", "title", "stock"],
    limit: 1,
    publicationState: "live",
  });
  const product = products?.[0];
  if (!product) {
    const err = new Error("Товар не найден");
    err.code = "PRODUCT_NOT_FOUND";
    throw err;
  }
  if (toNonNegativeInt(product.stock) !== 0) {
    const err = new Error("Предзаказ доступен при нулевом остатке");
    err.code = "PREORDER_STOCK_NOT_ZERO";
    throw err;
  }
}

module.exports = createCoreController("api::lead.lead", ({ strapi }) => ({
  async create(ctx) {
    const body = ctx.request.body;
    const data = body?.data;
    if (data && data.kind === "preorder") {
      try {
        await validatePreorderRequest(strapi, data);
      } catch (e) {
        if (e?.code && typeof e.message === "string") {
          return ctx.unprocessableEntity(e.message, { code: e.code });
        }
        strapi.log.error("[lead] preorder validate failed", e);
        return ctx.internalServerError("Не удалось оформить заявку");
      }
    }
    return await super.create(ctx);
  },
}));
