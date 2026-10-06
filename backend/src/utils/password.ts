import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const keyLength = 64;
const cost = 16_384;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, { N: cost }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);

  return `scrypt$${cost}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, encodedCost, saltHex, keyHex] = encoded.split('$');

  if (algorithm !== 'scrypt' || Number(encodedCost) !== cost || !saltHex || !keyHex) {
    return false;
  }

  const expectedKey = Buffer.from(keyHex, 'hex');
  if (expectedKey.length !== keyLength) return false;

  const actualKey = await deriveKey(password, Buffer.from(saltHex, 'hex'));
  return timingSafeEqual(expectedKey, actualKey);
}