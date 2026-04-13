"use strict";

const CUSTOMER_REVIEW_UID = "api::customer-review.customer-review";

/**
 * В админке Content Manager «редактируемость» поля задаётся metadatas.edit.editable
 * в core-store и при синке перекрывает только writable в схеме.
 * Фиксируем overallRating как read-only в UI.
 */
async function ensureCustomerReviewOverallRatingReadonly(strapi) {
  if (!strapi.contentTypes[CUSTOMER_REVIEW_UID]) {
    return;
  }

  let contentTypes;
  try {
    contentTypes = strapi.plugin("content-manager").service("content-types");
  } catch {
    return;
  }

  const configuration = await contentTypes.findConfiguration({
    uid: CUSTOMER_REVIEW_UID,
  });

  const existing = configuration?.metadatas?.overallRating;
  if (!existing?.edit) {
    return;
  }

  if (existing.edit.editable === false) {
    return;
  }

  await contentTypes.updateConfiguration(
    { uid: CUSTOMER_REVIEW_UID },
    {
      ...configuration,
      metadatas: {
        ...configuration.metadatas,
        overallRating: {
          ...existing,
          edit: {
            ...existing.edit,
            editable: false,
            description:
              existing.edit.description ||
              "Рассчитывается автоматически из списка отзывов.",
          },
        },
      },
    }
  );
}

module.exports = {
  ensureCustomerReviewOverallRatingReadonly,
};
