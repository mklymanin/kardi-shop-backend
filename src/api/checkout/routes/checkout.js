"use strict";

module.exports = {
  routes: [
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
