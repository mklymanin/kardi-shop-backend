"use strict";

module.exports = {
  async start(ctx) {
    try {
      const result = await strapi
        .service("api::checkout.checkout")
        .startCheckout(ctx.request.body || {});
      ctx.send(result, 200);
    } catch (error) {
      if (error?.name === "CheckoutValidationError") {
        return ctx.badRequest(error.message, {
          code: error.code || "CHECKOUT_VALIDATION_ERROR",
        });
      }

      if (error?.name === "CheckoutBusinessError") {
        return ctx.unprocessableEntity(error.message, {
          code: error.code || "CHECKOUT_BUSINESS_ERROR",
        });
      }

      if (error?.name === "CheckoutPaymentConfigError") {
        return ctx.serviceUnavailable(error.message, {
          code: error.code || "PAYMENT_PROVIDER_NOT_CONFIGURED",
        });
      }

      if (error?.name === "CheckoutPaymentProviderError") {
        return ctx.serviceUnavailable(error.message, {
          code: error.code || "PAYMENT_PROVIDER_UNAVAILABLE",
        });
      }

      strapi.log.error("[checkout] start failed", error);
      return ctx.internalServerError("Не удалось создать платеж");
    }
  },
};
