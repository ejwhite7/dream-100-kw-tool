import { AnthropicClient } from './anthropic';
import { CacheFactory, getCacheSystem } from '../lib/cache-init';
import { CACHE_TTL } from '../lib/cache-integrations';
import { AnthropicResponse } from '../types/anthropic';

/**
 * Cache-enhanced Anthropic client that integrates with the comprehensive Redis cache system
 */
export class CachedAnthropicClient {
  private client: AnthropicClient;
  private cache: ReturnType<typeof CacheFactory.createAnthropicCache> | null = null;
  
  constructor(client: AnthropicClient) {
    this.client = client;
    
    try {
      this.cache = CacheFactory.createAnthropicCache();
    } catch (error) {
      console.warn('Advanced caching not available for Anthropic, falling back to base client cache:', error);
    }
  }
  
  /**
   * Generate Dream 100 keywords with caching
   */
  async generateDream100(
    seedKeywords: string[],
    industry: string,
    targetAudience?: string,
    market: string = 'US'
  ): Promise<AnthropicResponse> {
    const cacheSystem = getCacheSystem();
    if (!cacheSystem) {
      return this.client.generateDream100(seedKeywords, industry, targetAudience, market);
    }
    
    const anthropic = cacheSystem.getIntegrations().anthropic;
    
    try {
      // Check cache first
      const cached = await anthropic.getCachedDream100(seedKeywords, market);
      
      if (cached) {
        console.log(`Dream 100 for [${seedKeywords.join(', ')}] served from cache`);
        return {
          success: true,
          data: cached,
          metadata: {
            fromCache: true,
            tokensUsed: 0,
            cost: 0,
            savings: 0.20, // Estimated cost for Dream 100 generation
          },
        };
      }
      
      // Generate new Dream 100
      console.log(`Generating Dream 100 for [${seedKeywords.join(', ')}] from Anthropic API`);
      const response = await this.client.generateDream100(seedKeywords, industry, targetAudience, market);
      
      if (response.success && Array.isArray(response.data)) {
        // Cache the result
        await anthropic.cacheDream100(seedKeywords, market, response.data);
        console.log(`Cached Dream 100 for [${seedKeywords.join(', ')}]`);
      }
      
      return {
        ...response,
        metadata: {
          ...response.metadata,
          fromCache: false,
        },
      };
    } catch (error) {
      console.error('Cached Dream 100 generation failed:', error);
      return this.client.generateDream100(seedKeywords, industry, targetAudience, market);
    }
  }
  
  /**
   * Classify keyword intents with caching
   */
  async classifyKeywordIntents(
    keywords: string[]
  ): Promise<AnthropicResponse> {
    const cacheSystem = getCacheSystem();
    if (!cacheSystem) {
      return this.client.classifyKeywordIntents(keywords);
    }
    
    const anthropic = cacheSystem.getIntegrations().anthropic;
    
    try {
      // Check cache for all keywords
      const { cached, missing } = await anthropic.getCachedIntentClassifications(keywords);
      
      const results: Array<{ keyword: string; intent: string; confidence: number }> = [];
      let fromCache = 0;
      let fromApi = 0;
      
      // Add cached results
      for (const keyword of keywords) {
        if (cached[keyword]) {
          results.push({
            keyword,
            intent: cached[keyword].intent,
            confidence: cached[keyword].confidence,
          });
          fromCache++;
        }
      }
      
      // Classify missing keywords
      if (missing.length > 0) {
        console.log(`Classifying ${missing.length} keyword intents from Anthropic API, ${fromCache} from cache`);
        
        try {
          const apiResponse = await this.client.classifyKeywordIntents(missing);
          
          if (apiResponse.success && Array.isArray(apiResponse.data)) {
            // Add API results
            results.push(...apiResponse.data);
            fromApi = apiResponse.data.length;
            
            // Cache the new classifications
            await anthropic.cacheIntentClassification(missing, apiResponse.data);
            
            console.log(`Cached ${apiResponse.data.length} intent classifications`);
          } else {
            // If API call fails, return cached results only
            console.warn('Intent classification API call failed, returning cached results only:', apiResponse.error);
            if (fromCache === 0) {
              return apiResponse; // No cached data, return error
            }
          }
        } catch (error) {
          console.error('Intent classification API call failed:', error);
          
          if (fromCache === 0) {
            throw error; // No cached data available
          }
          
          console.warn('Returning partial results from cache due to API failure');
        }
      }
      
      return {
        success: true,
        data: results,
        metadata: {
          fromCache,
          fromApi,
          total: results.length,
          cacheHitRate: fromCache / keywords.length,
          tokensUsed: fromApi * 50, // Estimated tokens per classification
          cost: fromApi * 0.001, // Estimated cost per classification
          savings: fromCache * 0.001, // Estimated savings
        },
      };
    } catch (error) {
      console.error('Cached intent classification request failed:', error);
      return this.client.classifyKeywordIntents(keywords);
    }
  }
  
  /**
   * Generate content titles with caching
   */
  async generateContentTitles(
    keywords: string[],
    intent: string,
    count: number = 5
  ): Promise<AnthropicResponse> {
    if (!this.cache) {
      return this.client.generateContentTitles(keywords, intent, count);
    }
    
    try {
      // Create cache key based on keywords, intent, and count
      const cacheKey = `titles:${intent}:${count}:${keywords.sort().join(',')}`;
      const cached = await this.cache.get(cacheKey, 'claude-3-sonnet');
      
      if (cached) {
        console.log(`Content titles for [${keywords.join(', ')}] served from cache`);
        return {
          success: true,
          data: cached,
          metadata: {
            fromCache: true,
            tokensUsed: 0,
            cost: 0,
            savings: 0.05, // Estimated cost for title generation
          },
        };
      }
      
      // Generate new titles
      const response = await this.client.generateContentTitles(keywords, intent, count);
      
      if (response.success) {
        // Cache the result
        await this.cache.set(cacheKey, 'claude-3-sonnet', response.data);
        console.log(`Cached content titles for [${keywords.join(', ')}]`);
      }
      
      return {
        ...response,
        metadata: {
          ...response.metadata,
          fromCache: false,
        },
      };
    } catch (error) {
      console.error('Cached title generation request failed:', error);
      return this.client.generateContentTitles(keywords, intent, count);
    }
  }
  
  /**
   * Expand keyword variations with caching
   */
  async expandKeywordVariations(
    baseKeywords: string[],
    variationType: 'tier2' | 'tier3',
    count: number = 10,
    market: string = 'US'
  ): Promise<AnthropicResponse> {
    if (!this.cache) {
      return this.client.expandKeywordVariations(baseKeywords, variationType, count, market);
    }
    
    try {
      // Create cache key
      const cacheKey = `expand:${variationType}:${count}:${market}:${baseKeywords.sort().join(',')}`;
      const cached = await this.cache.get(cacheKey, 'claude-3-sonnet');
      
      if (cached) {
        console.log(`Keyword variations for [${baseKeywords.join(', ')}] served from cache`);
        return {
          success: true,
          data: cached,
          metadata: {
            fromCache: true,
            tokensUsed: 0,
            cost: 0,
            savings: 0.10, // Estimated cost for expansion
          },
        };
      }
      
      // Generate new variations
      const response = await this.client.expandKeywordVariations(baseKeywords, variationType, count, market);
      
      if (response.success) {
        // Cache the result
        await this.cache.set(cacheKey, 'claude-3-sonnet', response.data);
        console.log(`Cached keyword variations for [${baseKeywords.join(', ')}]`);
      }
      
      return {
        ...response,
        metadata: {
          ...response.metadata,
          fromCache: false,
        },
      };
    } catch (error) {
      console.error('Cached keyword expansion request failed:', error);
      return this.client.expandKeywordVariations(baseKeywords, variationType, count, market);
    }
  }
  
  /**
   * Process prompts with automatic caching
   */
  async processPrompt(
    prompt: string,
    model: string = 'claude-3-sonnet-20240229',
    temperature: number = 0.1,
    maxTokens: number = 1000
  ): Promise<AnthropicResponse> {
    if (!this.cache) {
      return this.client.processPrompt(prompt, model, temperature, maxTokens);
    }
    
    try {
      // Check cache
      const cached = await this.cache.get(prompt, model, temperature);
      
      if (cached) {
        return {
          success: true,
          data: cached,
          metadata: {
            fromCache: true,
            tokensUsed: 0,
            cost: 0,
            model,
            temperature,
          },
        };
      }
      
      // Process new prompt
      const response = await this.client.processPrompt(prompt, model, temperature, maxTokens);
      
      if (response.success) {
        // Cache the result
        await this.cache.set(prompt, model, response.data, temperature);
      }
      
      return {
        ...response,
        metadata: {
          ...response.metadata,
          fromCache: false,
        },
      };
    } catch (error) {
      console.error('Cached prompt processing failed:', error);
      return this.client.processPrompt(prompt, model, temperature, maxTokens);
    }
  }
  
  /**
   * Invalidate cache
   */
  async invalidateCache(options: {
    all?: boolean;
    prompts?: string[];
  }): Promise<number> {
    if (!this.cache) {
      console.warn('Cache not available for invalidation');
      return 0;
    }
    
    try {
      return await this.cache.invalidate();
    } catch (error) {
      console.error('Cache invalidation failed:', error);
      return 0;
    }
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): {
    enabled: boolean;
    stats?: any;
    recommendations?: string[];
  } {
    if (!this.cache) {
      return { enabled: false };
    }
    
    const cacheSystem = getCacheSystem();
    if (!cacheSystem) {
      return { enabled: false };
    }
    
    const stats = cacheSystem.getCache().getStats();
    
    const recommendations: string[] = [];
    if (stats.hitRate < 0.7) {
      recommendations.push('Consider warming cache with common prompts');
    }
    
    return {
      enabled: true,
      stats: {
        hitRate: stats.hitRate,
        avgResponseTime: stats.operations.avgLatency,
        tokensUsed: 0, // Would track separately
        costSaved: stats.hits * 0.01, // Estimated
      },
      recommendations,
    };
  }
  
  /**
   * Proxy other methods to original client
   */
  async createCompletionStream(
    prompt: string,
    options?: any
  ): Promise<any> {
    // Streaming responses typically aren't cached
    return this.client.createCompletionStream(prompt, options);
  }
  
  async createChatCompletion(
    messages: any[],
    options?: any
  ): Promise<AnthropicResponse> {
    // Could add caching for chat completions too
    return this.client.createChatCompletion(messages, options);
  }
  
  // Proxy health check and other utility methods
  healthCheck = this.client.healthCheck?.bind(this.client);
  getUsage = this.client.getUsage?.bind(this.client);
}

/**
 * Factory function to create cached Anthropic client
 */
export function createCachedAnthropicClient(originalClient: AnthropicClient): CachedAnthropicClient {
  return new CachedAnthropicClient(originalClient);
}

/**
 * Performance testing and migration utilities
 */
export class AnthropicCacheMigration {
  /**
   * Performance comparison test
   */
  static async performanceTest(
    cachedClient: CachedAnthropicClient,
    originalClient: AnthropicClient,
    testPrompts: string[]
  ): Promise<{
    cached: { time: number; cost: number; fromCache: number };
    uncached: { time: number; cost: number };
    improvement: { timeReduction: number; costSavings: number };
  }> {
    console.log('Starting Anthropic caching performance test...');
    
    // Test cached client (run twice to show cache benefit)
    const cachedStart = Date.now();
    await Promise.all(
      testPrompts.map(prompt => 
        cachedClient.processPrompt(prompt, 'claude-3-sonnet-20240229', 0.1, 100)
      )
    );
    const cachedTime = Date.now() - cachedStart;
    
    // Run again to hit cache
    const cachedStart2 = Date.now();
    const cachedResponses = await Promise.all(
      testPrompts.map(prompt => 
        cachedClient.processPrompt(prompt, 'claude-3-sonnet-20240229', 0.1, 100)
      )
    );
    const cachedTime2 = Date.now() - cachedStart2;
    
    const fromCache = cachedResponses.filter(r => r.metadata?.fromCache).length;
    
    // Test original client (limited to avoid API costs)
    const uncachedStart = Date.now();
    await originalClient.processPrompt(
      testPrompts[0],
      'claude-3-sonnet-20240229',
      0.1,
      100
    );
    const uncachedTime = Date.now() - uncachedStart;
    
    const results = {
      cached: {
        time: cachedTime2, // Second run with cache hits
        cost: (testPrompts.length - fromCache) * 0.01,
        fromCache,
      },
      uncached: {
        time: uncachedTime * testPrompts.length, // Estimated
        cost: testPrompts.length * 0.01,
      },
      improvement: {
        timeReduction: ((uncachedTime - cachedTime2) / uncachedTime) * 100,
        costSavings: fromCache * 0.01,
      },
    };
    
    console.log('Anthropic performance test results:', results);
    return results;
  }
  
  /**
   * Cache warming for common prompts
   */
  static async warmCommonPrompts(
    client: CachedAnthropicClient,
    industry: string
  ): Promise<number> {
    const commonPrompts = [
      `Generate 10 keyword ideas for ${industry} business`,
      `Classify the intent of keywords related to ${industry}`,
      `Create content titles for ${industry} marketing`,
      `Expand keyword variations for ${industry} services`,
    ];
    
    let warmed = 0;
    for (const prompt of commonPrompts) {
      try {
        await client.processPrompt(prompt);
        warmed++;
      } catch (error) {
        console.warn(`Failed to warm prompt: ${prompt}`, error);
      }
    }
    
    return warmed;
  }
}
