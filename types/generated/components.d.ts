import type { Schema, Struct } from "@strapi/strapi";

export interface ReviewReviewEntry extends Struct.ComponentSchema {
  collectionName: "components_review_review_entries";
  info: {
    description: "\u041E\u0434\u0438\u043D \u043E\u0442\u0437\u044B\u0432 \u0434\u043B\u044F \u0431\u043B\u043E\u043A\u0430 \u043D\u0430 \u0441\u0430\u0439\u0442\u0435";
    displayName: "Review entry";
  };
  attributes: {
    authorName: Schema.Attribute.String & Schema.Attribute.Required;
    rating: Schema.Attribute.Decimal &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          max: 5;
          min: 1;
        },
        number
      >;
    reviewDate: Schema.Attribute.DateTime & Schema.Attribute.Required;
    text: Schema.Attribute.Text & Schema.Attribute.Required;
  };
}

export interface BannerHeroSlide extends Struct.ComponentSchema {
  collectionName: "components_banner_hero_slides";
  info: {
    description: "\u0421\u043B\u0430\u0439\u0434 \u0431\u0430\u043D\u043D\u0435\u0440\u0430 \u043D\u0430 \u0433\u043B\u0430\u0432\u043D\u043E\u0439";
    displayName: "Hero slide";
  };
  attributes: {
    image: Schema.Attribute.Media<"images"> & Schema.Attribute.Required;
    link: Schema.Attribute.String;
    text: Schema.Attribute.Text;
  };
}

declare module "@strapi/strapi" {
  export module Public {
    export interface ComponentSchemas {
      "banner.hero-slide": BannerHeroSlide;
      "review.review-entry": ReviewReviewEntry;
    }
  }
}
