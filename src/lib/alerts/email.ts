import { Buffer } from "node:buffer";
import net from "node:net";
import tls from "node:tls";

/**
 * Phase A3: Scaleway TEM SMTP 経由の運用メール送信。
 *
 * memory `reference_scaleway_tem_smtp.md` に従い、
 *   - Host: smtp.tem.scaleway.com
 *   - Port: 2587 (DO は 587 がブロックされる)
 *   - Username: Scaleway Project ID (UUID)
 *   - Password: IAM API Secret Key
 *   - Encryption: STARTTLS
 *
 * 送信先は OPS_EMAIL_TO（カンマ区切り）。From は OPS_EMAIL_FROM。
 * 設定が揃っていない時は no-op で開発を妨げない。
 *
 * 依存追加なしの最小実装。本格運用で複雑な MIME / 添付が必要になったら
 * nodemailer 等への置き換えを検討する。
 */

export type OpsEmailInput = {
  subject: string;
  text: string;
  /** カンマ区切りでなく配列で上書きしたい場合に使う */
  to?: string[];
};

type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  fromName: string | undefined;
  to: string[];
};

function readConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST ?? "smtp.tem.scaleway.com";
  const portRaw = process.env.SMTP_PORT ?? "2587";
  const port = Number(portRaw);
  const user = process.env.SMTP_USERNAME ?? "";
  const pass = process.env.SMTP_PASSWORD ?? "";
  const from = process.env.OPS_EMAIL_FROM ?? "";
  const fromName = process.env.OPS_EMAIL_FROM_NAME;
  const toRaw = process.env.OPS_EMAIL_TO ?? "";
  const to = toRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!user || !pass || !from || to.length === 0 || !Number.isFinite(port)) {
    return null;
  }
  return { host, port, user, pass, from, fromName, to };
}

function encodeHeader(value: string): string {
  // ASCII 範囲ならそのまま、非 ASCII は RFC 2047 base64 で encode する
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

async function readResponse(socket: net.Socket | tls.TLSSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = "";
    const onData = (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      // SMTP では `XXX-` で続行、`XXX ` で終端 (XXX は 3 桁ステータス)
      const lines = buf.split(/\r?\n/);
      const last = lines[lines.length - 2]; // 末尾は空行
      if (last && /^\d{3} /.test(last)) {
        cleanup();
        resolve(buf);
      }
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };
    socket.on("data", onData);
    socket.on("error", onError);
  });
}

async function send(config: SmtpConfig, to: string[], subject: string, text: string): Promise<void> {
  const socket = net.createConnection({ host: config.host, port: config.port });
  socket.setEncoding("utf8");

  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("error", reject);
  });

  const greeting = await readResponse(socket);
  if (!greeting.startsWith("220")) throw new Error(`SMTP greeting unexpected: ${greeting}`);

  socket.write(`EHLO boundarylabo.com\r\n`);
  await readResponse(socket);

  socket.write(`STARTTLS\r\n`);
  const startTls = await readResponse(socket);
  if (!startTls.startsWith("220")) throw new Error(`STARTTLS failed: ${startTls}`);

  // 既存ソケットをラップして TLS にアップグレード
  const tlsSocket: tls.TLSSocket = await new Promise((resolve, reject) => {
    const s = tls.connect(
      {
        socket,
        host: config.host,
        servername: config.host,
      },
      () => resolve(s),
    );
    s.once("error", reject);
  });
  tlsSocket.setEncoding("utf8");

  tlsSocket.write(`EHLO boundarylabo.com\r\n`);
  await readResponse(tlsSocket);

  tlsSocket.write(`AUTH LOGIN\r\n`);
  await readResponse(tlsSocket);
  tlsSocket.write(`${Buffer.from(config.user, "utf8").toString("base64")}\r\n`);
  await readResponse(tlsSocket);
  tlsSocket.write(`${Buffer.from(config.pass, "utf8").toString("base64")}\r\n`);
  const authResp = await readResponse(tlsSocket);
  if (!authResp.startsWith("235")) throw new Error(`AUTH failed: ${authResp.slice(0, 200)}`);

  tlsSocket.write(`MAIL FROM:<${config.from}>\r\n`);
  const mailFromResp = await readResponse(tlsSocket);
  if (!mailFromResp.startsWith("250")) throw new Error(`MAIL FROM failed: ${mailFromResp}`);

  for (const recipient of to) {
    tlsSocket.write(`RCPT TO:<${recipient}>\r\n`);
    const rcptResp = await readResponse(tlsSocket);
    if (!rcptResp.startsWith("250") && !rcptResp.startsWith("251")) {
      throw new Error(`RCPT TO ${recipient} failed: ${rcptResp}`);
    }
  }

  tlsSocket.write(`DATA\r\n`);
  const dataResp = await readResponse(tlsSocket);
  if (!dataResp.startsWith("354")) throw new Error(`DATA failed: ${dataResp}`);

  const fromHeader = config.fromName
    ? `${encodeHeader(config.fromName)} <${config.from}>`
    : config.from;
  const headerLines = [
    `From: ${fromHeader}`,
    `To: ${to.join(", ")}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
  ];
  // CRLF.CRLF を避けるため base64 化、76 文字で wrap
  const bodyB64 = Buffer.from(text, "utf8").toString("base64");
  const wrapped = bodyB64.replace(/(.{1,76})/g, "$1\r\n").trimEnd();

  tlsSocket.write(`${headerLines.join("\r\n")}\r\n\r\n${wrapped}\r\n.\r\n`);
  const dataEnd = await readResponse(tlsSocket);
  if (!dataEnd.startsWith("250")) throw new Error(`DATA end failed: ${dataEnd}`);

  tlsSocket.write(`QUIT\r\n`);
  try {
    await readResponse(tlsSocket);
  } catch {
    // QUIT 後の close はサーバーが先に切ることがあるので無視
  }
  tlsSocket.destroy();
}

/**
 * 運用通知メールを送る。設定が無い時は no-op (warn ログだけ)。
 *
 * 失敗時は throw する。呼び出し側 (job-runner / alerts) で握って Discord 通知に
 * fallback する想定。
 */
export async function sendOpsEmail(input: OpsEmailInput): Promise<{ sent: boolean }> {
  const config = readConfig();
  if (!config) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[ops-email] SMTP env 未設定のため送信スキップ", {
        subject: input.subject,
      });
    }
    return { sent: false };
  }
  const to = input.to && input.to.length > 0 ? input.to : config.to;
  await send(config, to, input.subject, input.text);
  return { sent: true };
}
