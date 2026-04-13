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

declare module "@strapi/strapi" {
  export module Public {
    export interface ComponentSchemas {
      "review.review-entry": ReviewReviewEntry;
    }
  }
}
