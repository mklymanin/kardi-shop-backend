const publicReadActions = [
  "api::product.product.find",
  "api::product.product.findOne",
  "api::category.category.find",
  "api::category.category.findOne",
  "api::page.page.find",
  "api::page.page.findOne",
  "api::site-setting.site-setting.find",
  "api::order.order.create"
];

async function ensurePublicPermissions(strapi) {
  const publicRole = await strapi.db.query("plugin::users-permissions.role").findOne({
    where: { type: "public" }
  });

  if (!publicRole) {
    return;
  }

  for (const action of publicReadActions) {
    const exists = await strapi.db.query("plugin::users-permissions.permission").findOne({
      where: {
        role: publicRole.id,
        action
      }
    });

    if (!exists) {
      await strapi.db.query("plugin::users-permissions.permission").create({
        data: {
          role: publicRole.id,
          action
        }
      });
    }
  }
}

async function ensureSeedContent(strapi) {
  const existingCategory = await strapi.db.query("api::category.category").findOne({
    where: { slug: "diagnostika" }
  });

  const category =
    existingCategory ||
    (await strapi.db.query("api::category.category").create({
      data: {
        title: "Диагностика",
        slug: "diagnostika",
        description: "Оборудование для кардиологической и функциональной диагностики.",
        seoTitle: "Диагностическое оборудование",
        seoDescription: "Категория диагностического оборудования для магазина shop.kardi."
      }
    }));

  const existingProduct = await strapi.db.query("api::product.product").findOne({
    where: { slug: "ecg-monitor-pro" }
  });

  if (!existingProduct) {
    await strapi.db.query("api::product.product").create({
      data: {
        title: "ECG Monitor Pro",
        slug: "ecg-monitor-pro",
        sku: "KARDI-ECG-001",
        excerpt: "Компактный монитор пациента для амбулаторной и стационарной практики.",
        description:
          "<p>Тестовый товар, созданный при первом запуске проекта. Его можно редактировать или удалить через админку Strapi.</p>",
        price: 89000,
        isPublishedToStore: true,
        category: category.id,
        seoTitle: "ECG Monitor Pro",
        seoDescription: "Тестовая карточка товара для локального запуска shop.kardi."
      }
    });
  }

  const existingPage = await strapi.db.query("api::page.page").findOne({
    where: { slug: "about" }
  });

  if (!existingPage) {
    await strapi.db.query("api::page.page").create({
      data: {
        title: "О компании",
        slug: "about",
        content:
          "<p>Это тестовая страница, созданная автоматически при первом запуске локального проекта.</p>",
        seoTitle: "О компании",
        seoDescription: "Тестовая информационная страница."
      }
    });
  }

  const siteSettings = await strapi.db.query("api::site-setting.site-setting").findOne({
    where: {}
  });

  if (!siteSettings) {
    await strapi.db.query("api::site-setting.site-setting").create({
      data: {
        siteName: "shop.kardi",
        defaultSeoTitle: "shop.kardi",
        defaultSeoDescription: "Новый магазин медицинского оборудования.",
        contactEmail: "info@shop.kardi.ru",
        contactPhone: "+7 (495) 000-00-00"
      }
    });
  }
}

module.exports = {
  async register() {},

  async bootstrap({ strapi }) {
    await ensurePublicPermissions(strapi);
    await ensureSeedContent(strapi);
  }
};
