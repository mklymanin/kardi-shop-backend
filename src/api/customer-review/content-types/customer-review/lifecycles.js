"use strict";

const UID = "api::customer-review.customer-review";
const REVIEW_COMPONENT_UID = "review.review-entry";

function getStrapi() {
  if (!global.strapi) {
    throw new Error("Strapi is not initialized");
  }
  return global.strapi;
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function nonEmptyTrimmedString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidReviewDate(value) {
  if (value == null || value === "") {
    return false;
  }
  const d = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(d.getTime());
}

async function loadReviewRowsByIds(strapi, ids) {
  if (ids.size === 0) {
    return new Map();
  }
  const rows = await strapi.db.query(REVIEW_COMPONENT_UID).findMany({
    where: {
      id: { $in: [...ids] },
    },
  });
  return new Map(rows.map((row) => [String(row.id), row]));
}

/**
 * Strapi не всегда применяет `required` к полям внутри повторяемого компонента
 * в Content Manager — проверяем на сервере перед сохранением.
 */
async function assertReviewsComplete(strapi, reviews) {
  if (!Array.isArray(reviews) || reviews.length === 0) {
    return;
  }

  const idsToLoad = new Set();
  for (const item of reviews) {
    if (!item || typeof item !== "object") {
      continue;
    }
    if (item.id != null) {
      idsToLoad.add(item.id);
    }
  }

  const byId = await loadReviewRowsByIds(strapi, idsToLoad);

  for (let i = 0; i < reviews.length; i++) {
    const item = reviews[i];
    if (item == null) {
      continue;
    }
    if (typeof item !== "object") {
      throw new Error(`Отзыв ${i + 1}: некорректная структура данных`);
    }

    const label = `Отзыв ${i + 1}`;

    let merged;
    if (item.id != null) {
      const row = byId.get(String(item.id));
      if (!row) {
        throw new Error(`${label}: запись отзыва не найдена в базе данных`);
      }
      merged = { ...row, ...item };
    } else {
      merged = item;
    }

    if (!nonEmptyTrimmedString(merged.authorName)) {
      throw new Error(`${label}: укажите имя автора`);
    }
    if (!nonEmptyTrimmedString(merged.text)) {
      throw new Error(`${label}: укажите текст отзыва`);
    }
    const rating = toFiniteNumber(merged.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new Error(`${label}: оценка должна быть числом от 1 до 5`);
    }
    if (!isValidReviewDate(merged.reviewDate)) {
      throw new Error(`${label}: укажите дату отзыва`);
    }
  }
}

async function maybeValidateReviewsPayload(event) {
  const data = event.params?.data;
  if (!data || typeof data !== "object") {
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(data, "reviews")) {
    return;
  }

  let reviews = data.reviews;
  if (reviews == null) {
    reviews = [];
  }
  if (!Array.isArray(reviews)) {
    throw new Error("Поле «Отзывы» должно быть массивом");
  }

  const strapi = getStrapi();
  await assertReviewsComplete(strapi, reviews);
}

/**
 * В `beforeCreate` / `beforeUpdate` в `data.reviews` приходят связи вида
 * `{ id, __pivot, component_type }` без скалярных полей компонента — их
 * нужно прочитать из таблицы компонента.
 */
async function collectReviewRatings(strapi, reviews) {
  if (!Array.isArray(reviews) || reviews.length === 0) {
    return [];
  }

  const ratings = [];
  const idsToLoad = new Set();

  for (const item of reviews) {
    if (!item) continue;
    const inline = toFiniteNumber(item.rating);
    if (Number.isFinite(inline)) {
      ratings.push(inline);
      continue;
    }
    if (item.id != null) {
      idsToLoad.add(item.id);
    }
  }

  if (idsToLoad.size === 0) {
    return ratings;
  }

  const idList = [...idsToLoad];
  const rows = await strapi.db.query(REVIEW_COMPONENT_UID).findMany({
    where: {
      id: { $in: idList },
    },
  });

  const byId = new Map(rows.map((row) => [String(row.id), row]));

  for (const item of reviews) {
    if (!item) continue;
    if (Number.isFinite(toFiniteNumber(item.rating))) {
      continue;
    }
    if (item.id == null) continue;
    const row = byId.get(String(item.id));
    if (!row) continue;
    const n = toFiniteNumber(row.rating);
    if (Number.isFinite(n)) {
      ratings.push(n);
    }
  }

  return ratings;
}

function average(nums) {
  if (!nums.length) {
    return 0;
  }
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

async function syncOverallRating(event) {
  const data = event.params?.data;
  if (!data || typeof data !== "object") {
    return;
  }

  const strapi = getStrapi();
  const hasReviewsKey = Object.prototype.hasOwnProperty.call(data, "reviews");
  let reviews;

  if (hasReviewsKey) {
    reviews = data.reviews;
  } else if (event.action === "beforeUpdate") {
    const where = event.params.where;
    const existing = where
      ? await strapi.db.query(UID).findOne({
          where,
          populate: { reviews: true },
        })
      : null;
    reviews = existing?.reviews ?? [];
  } else {
    reviews = [];
  }

  if (!Array.isArray(reviews)) {
    reviews = [];
  }

  const ratings = await collectReviewRatings(strapi, reviews);
  data.overallRating = average(ratings);
}

module.exports = {
  async beforeCreate(event) {
    await maybeValidateReviewsPayload(event);
    await syncOverallRating(event);
  },
  async beforeUpdate(event) {
    await maybeValidateReviewsPayload(event);
    await syncOverallRating(event);
  },
};
