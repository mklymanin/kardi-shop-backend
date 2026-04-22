"use strict";

function formatMoney(value) {
  const numeric = Number(value) || 0;
  return `${numeric.toFixed(2)} RUB`;
}

function formatLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return "Состав заказа уточняется";
  }

  return lines
    .map((line) => {
      const quantity = Number(line?.quantity) || 0;
      let title = String(line?.title || line?.slug || "Товар");
      const price = Number(line?.price) || 0;
      if (line?.lineType === "rent") {
        const period = String(line?.rentalPeriodLabel || "").trim();
        title = period ? `${title} (аренда, ${period})` : `${title} (аренда)`;
      }
      return `- ${title}: ${quantity} x ${formatMoney(price)}`;
    })
    .join("\n");
}

function buildOrderCreatedEmailTemplate(payload) {
  return {
    subject: `Заказ #${payload.orderId} создан`,
    text: [
      `Здравствуйте, ${payload.customerName || "покупатель"}!`,
      "",
      `Ваш заказ #${payload.orderId} создан.`,
      `Итого: ${formatMoney(payload.total)}.`,
      `Способ получения: ${payload.deliveryMethodTitle || payload.deliveryMethodCode || "не указан"}.`,
      "",
      "Состав заказа:",
      formatLines(payload.itemsRaw),
      "",
      "Для завершения заказа перейдите по ссылке оплаты:",
      payload.paymentUrl,
    ].join("\n"),
  };
}

function buildOrderPaymentReminderEmailTemplate(payload) {
  return {
    subject: `Напоминание об оплате заказа #${payload.orderId}`,
    text: [
      `Здравствуйте, ${payload.customerName || "покупатель"}!`,
      "",
      `Напоминаем об оплате заказа #${payload.orderId}.`,
      `Итого к оплате: ${formatMoney(payload.total)}.`,
      "",
      "Ссылка для продолжения оплаты:",
      payload.paymentUrl,
    ].join("\n"),
  };
}

module.exports = {
  buildOrderCreatedEmailTemplate,
  buildOrderPaymentReminderEmailTemplate,
};
