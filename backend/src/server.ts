import { createLlmProvider } from './analysis/index.js';
import { createApp } from './app.js';
import { config } from './config/env.js';
import { createDatabase } from './db/client.js';
import { createRepository } from './db/repository.js';

const db = createDatabase(config.DATABASE_PATH);
const app = createApp(createRepository(db), createLlmProvider(config.LLM_PROVIDER));

app.listen(config.PORT, () => {
  console.log(`Backend listening on http://localhost:${config.PORT}`);
});
