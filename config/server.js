module.exports = ({ env }) => ({
  host: env("HOST", "0.0.0.0"),
  port: Number(env("PORT", "1337")),
  app: {
    keys: env("APP_KEYS", "dev-key-a,dev-key-b").split(",")
  }
});

