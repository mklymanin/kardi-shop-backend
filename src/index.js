const {
  ensureDefaultDeliveryMethods,
} = require("./bootstrap/ensure-delivery-methods");

const publicReadActions = [
  "api::product.product.find",
  "api::product.product.findOne",
  "api::category.category.find",
  "api::category.category.findOne",
  "api::page.page.find",
  "api::page.page.findOne",
  "api::site-setting.site-setting.find",
  "api::delivery-method.delivery-method.find",
  "api::delivery-method.delivery-method.findOne",
  "api::lead.lead.create",
  "api::checkout.checkout.start",
];
const revokedPublicActions = ["api::order.order.create"];

async function ensurePublicPermissions(strapi) {
  const publicRole = await strapi.db
    .query("plugin::users-permissions.role")
    .findOne({
      where: { type: "public" },
    });

  if (!publicRole) {
    return;
  }

  for (const action of publicReadActions) {
    const exists = await strapi.db
      .query("plugin::users-permissions.permission")
      .findOne({
        where: {
          role: publicRole.id,
          action,
        },
      });

    if (!exists) {
      await strapi.db.query("plugin::users-permissions.permission").create({
        data: {
          role: publicRole.id,
          action,
        },
      });
    }
  }

  for (const action of revokedPublicActions) {
    const existing = await strapi.db
      .query("plugin::users-permissions.permission")
      .findOne({
        where: {
          role: publicRole.id,
          action,
        },
      });

    if (existing) {
      await strapi.db.query("plugin::users-permissions.permission").delete({
        where: { id: existing.id },
      });
    }
  }
}

module.exports = {
  async register() {},

  async bootstrap({ strapi }) {
    await ensurePublicPermissions(strapi);
    await ensureDefaultDeliveryMethods(strapi);
  },
};
