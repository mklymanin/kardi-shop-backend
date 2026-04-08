"use strict";

const defaultDeliveryMethods = [
  {
    title: "Самовывоз",
    code: "pickup",
    price: 0,
    pickupAddress: "Укажите адрес склада в админке Strapi",
    isActive: true,
    sortOrder: 1,
  },
  {
    title: "Доставка",
    code: "courier",
    price: 500,
    pickupAddress: null,
    isActive: true,
    sortOrder: 2,
  },
  {
    title: "Почта России",
    code: "russian_post",
    price: 450,
    pickupAddress: null,
    isActive: true,
    sortOrder: 3,
  },
];

async function ensureDefaultDeliveryMethods(strapi) {
  for (const method of defaultDeliveryMethods) {
    const existing = await strapi.db
      .query("api::delivery-method.delivery-method")
      .findOne({
        where: { code: method.code },
      });

    if (!existing) {
      await strapi.db.query("api::delivery-method.delivery-method").create({
        data: method,
      });
    }
  }
}

module.exports = {
  ensureDefaultDeliveryMethods,
};
