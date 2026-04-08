"use strict";

function isEmailEnabled() {
  return String(process.env.EMAIL_ENABLED || "true").toLowerCase() !== "false";
}

async function sendEmailWithConsoleTransport(message) {
  strapi.log.info(
    `[email:console] to=${message.to} subject="${message.subject}"\n${message.text}`
  );
}

module.exports = {
  async send(message) {
    if (!isEmailEnabled()) {
      return;
    }

    const provider = String(process.env.EMAIL_PROVIDER || "console")
      .trim()
      .toLowerCase();

    if (provider === "console" || provider === "noop") {
      await sendEmailWithConsoleTransport(message);
      return;
    }

    throw new Error(`Unknown EMAIL_PROVIDER "${provider}"`);
  },
};
