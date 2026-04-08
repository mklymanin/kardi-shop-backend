"use strict";

function normalizeCode(code) {
  return String(code ?? "")
    .trim()
    .toUpperCase();
}

function toNumber(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : NaN;
}

function validateCoupon(data) {
  if (!data) return;

  if (typeof data.code !== "undefined") {
    data.code = normalizeCode(data.code);
    if (data.code.length < 3) {
      throw new Error("Код купона должен быть не короче 3 символов");
    }
  }

  const discountType = data.discountType;
  const discountValue =
    typeof data.discountValue === "undefined"
      ? undefined
      : toNumber(data.discountValue);

  if (discountType && typeof discountValue !== "undefined") {
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      throw new Error("Значение скидки должно быть больше нуля");
    }

    if (discountType === "percent" && discountValue > 100) {
      throw new Error("Процент скидки должен быть в диапазоне 1-100");
    }
  }

  const startsAt = data.startsAt ? new Date(data.startsAt) : null;
  const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
  if (startsAt && expiresAt && startsAt > expiresAt) {
    throw new Error(
      "Дата начала действия купона не может быть позже даты окончания"
    );
  }
}

module.exports = {
  beforeCreate(event) {
    validateCoupon(event?.params?.data);
  },
  beforeUpdate(event) {
    validateCoupon(event?.params?.data);
  },
};
