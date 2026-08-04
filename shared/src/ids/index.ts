import { v7 as uuidv7 } from "uuid";

export function gerarUuidV7(agoraMs = Date.now()): string {
  return uuidv7({ msecs: agoraMs });
}
