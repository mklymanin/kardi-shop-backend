"use strict";

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController(
  "api::delivery-method.delivery-method",
  () => ({
    async find(ctx) {
      ctx.query ??= {};
      ctx.query.filters ??= {};
      ctx.query.filters.isActive = { $eq: true };
      return await super.find(ctx);
    },
  })
);
