import type { AiService } from './ai';
import type { Config } from './config';
import type { Db } from './db/client';
import type { IdentityVerifier } from './services/auth';
import type { EmailSender } from './services/email';
import type { PushSender } from './services/push';

/** Everything the app talks to; tests replace the external ones with fakes. */
export interface AppDeps {
  config: Config;
  db: Db;
  ai: AiService;
  email: EmailSender;
  push: PushSender;
  verifyGoogle: IdentityVerifier;
  verifyApple: IdentityVerifier;
  fetch: typeof fetch;
  now: () => Date;
}
