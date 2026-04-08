"use strict";

module.exports = {
  routes: [
    {
      method: "POST",
      path: "/checkout/quote",
      handler: "checkout.quote",
      config: {
        auth: false,
      },
    },
    {
      method: "POST",
      path: "/checkout/start",
      handler: "checkout.start",
      config: {
        auth: false,
      },
    },
  ],
};
