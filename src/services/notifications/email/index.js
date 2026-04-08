"use strict";

const transport = require("./transport");
const {
  buildOrderCreatedEmailTemplate,
  buildOrderPaymentReminderEmailTemplate,
} = require("./templates");

function createBaseMessage(order) {
  return {
    to: order.email,
    from: process.env.EMAIL_FROM || "no-reply@kardi.local",
  };
}

async function sendWithTemplate(builder, order) {
  if (!order?.email) {
    return;
  }

  const template = builder(order);
  await transport.send({
    ...createBaseMessage(order),
    subject: template.subject,
    text: template.text,
  });
}

module.exports = {
  async sendOrderCreatedEmail(order) {
    await sendWithTemplate(buildOrderCreatedEmailTemplate, order);
  },
  async sendOrderPaymentReminderEmail(order) {
    await sendWithTemplate(buildOrderPaymentReminderEmailTemplate, order);
  },
};
