import jwt from "jsonwebtoken";

type PermsTokenPayload = {
  iat: number;
  exp: number;
  perms: {
    join_hub: true;
    kick_users: false;
  };
};

const ONE_DAY_SECONDS = 24 * 60 * 60;

export function generatePermsToken(pemKey: string): string {
  const iat = Math.floor(Date.now() / 1000);
  const payload: PermsTokenPayload = {
    iat,
    exp: iat + ONE_DAY_SECONDS,
    perms: {
      join_hub: true,
      kick_users: false,
    },
  };

  return jwt.sign(payload, pemKey, {
    algorithm: "RS256",
    noTimestamp: true,
  });
}
