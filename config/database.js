module.exports = ({ env }) => {
  const client = env("DATABASE_CLIENT", "postgres");

  return {
    connection: {
      client,
      connection: {
        host: env("DATABASE_HOST", "127.0.0.1"),
        port: Number(env("DATABASE_PORT", "5432")),
        database: env("DATABASE_NAME", "shop_kardi"),
        user: env("DATABASE_USERNAME", "shop_kardi"),
        password: env("DATABASE_PASSWORD", "shop_kardi"),
        ssl: env("DATABASE_SSL", "false") === "true",
      },
      debug: env("DATABASE_DEBUG", "false") === "true",
    },
  };
};
