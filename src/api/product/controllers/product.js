"use strict";

const { createCoreController } = require("@strapi/strapi").factories;

function ensureStoreFilters(query) {
  query.filters ??= {};
  query.filters.isPublishedToStore = { $eq: true };
}

module.exports = createCoreController("api::product.product", () => ({
  async find(ctx) {
    ensureStoreFilters(ctx.query);
    return await super.find(ctx);
  },
}));
