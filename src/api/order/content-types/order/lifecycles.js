"use strict";

function getStrapi() {
  if (!global.strapi) {
    throw new Error("Strapi is not initialized");
  }
  return global.strapi;
}

function toLineItems(itemsRaw) {
  if (!Array.isArray(itemsRaw)) {
    return [];
  }
  return itemsRaw
    .map((row) => {
      if (!row || typeof row !== "object") {
        return null;
      }
      const slug = String(row.slug ?? "").trim();
      const q = Math.max(1, Math.trunc(Number(row.quantity) || 0));
      if (!slug || !q) {
        return null;
      }
      return { slug, quantity: q };
    })
    .filter(Boolean);
}

module.exports = {
  /**
   * Списывает остатки при первом переводе заказа в `paymentStatus: paid`
   * (идемпотентно через `inventoryApplied` на заказе).
   */
  async afterUpdate(event) {
    const { result } = event;
    if (!result) {
      return;
    }
    if (result.paymentStatus !== "paid" || result.inventoryApplied === true) {
      return;
    }

    const strapi = getStrapi();
    const orderRows = await strapi.entityService.findMany("api::order.order", {
      filters: { id: { $eq: result.id } },
      fields: ["itemsRaw", "paymentStatus", "inventoryApplied", "id"],
      limit: 1,
    });
    const order = orderRows?.[0];
    if (
      !order ||
      order.paymentStatus !== "paid" ||
      order.inventoryApplied === true
    ) {
      return;
    }

    const productUid = "api::product.product";
    const productMeta = strapi.db.metadata.get(productUid);
    const tableName = productMeta?.tableName;
    if (!tableName) {
      strapi.log.error("[order.lifecycle] no table for product model");
      return;
    }

    const items = toLineItems(order.itemsRaw);
    if (items.length === 0) {
      await strapi.entityService.update("api::order.order", order.id, {
        data: { inventoryApplied: true },
      });
      return;
    }

    const knex = strapi.db.connection;
    const trx = await knex.transaction();

    try {
      for (const line of items) {
        const n = await trx(tableName)
          .where({ slug: line.slug })
          .where("stock", ">=", line.quantity)
          .decrement("stock", line.quantity);
        if (!n) {
          strapi.log.error(
            `[order.lifecycle] insufficient stock (orderId=${order.id} slug=${line.slug} qty=${line.quantity})`
          );
          throw new Error("STOCK_DEDUCT_FAILED");
        }
      }
      await trx.commit();
    } catch (e) {
      await trx.rollback();
      return;
    }

    try {
      await strapi.entityService.update("api::order.order", order.id, {
        data: { inventoryApplied: true },
      });
    } catch (err) {
      strapi.log.error("[order.lifecycle] inventoryApplied not set", err);
    }
  },
};
