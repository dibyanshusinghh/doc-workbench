import type { Config } from '../config/env.js';
import { MockLlmProvider } from './mockProvider.js';
import type { LlmProvider } from './provider.js';

/** Picks the AI provider from config. Add real providers here. */
export function createLlmProvider(name: Config['LLM_PROVIDER']): LlmProvider {
  switch (name) {
    case 'mock':
      return new MockLlmProvider();
  }
}
