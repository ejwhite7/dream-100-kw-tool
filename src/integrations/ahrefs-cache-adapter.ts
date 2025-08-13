import { AhrefsClient } from './ahrefs';
import { CacheFactory, getCacheSystem } from '../lib/cache-init';
import { CACHE_TTL } from '../lib/cache-integrations';
import { AhrefsMetrics, AhrefsResponse } from '../types/ahrefs';

/**
 * Cache-enhanced Ahrefs client that integrates with the comprehensive Redis cache system
 * This adapter wraps the existing AhrefsClient to add advanced caching capabilities
 */
export class CachedAhrefsClient {
  private client: AhrefsClient;
  private cache: ReturnType<typeof CacheFactory.createAhrefsCache> | null = null;
  
  constructor(client: AhrefsClient) {
    this.client = client;
    
    try {
      this.cache = CacheFactory.createAhrefsCache();
    } catch (error) {
      console.warn('Advanced caching not available, falling back to base client cache:', error);
    }
  }
  
  /**
   * Get keyword metrics with advanced caching
   */
  async getKeywordMetrics(
    keywords: string[],
    market: string = 'US',
    metrics: AhrefsMetrics[] = ['volume', 'difficulty', 'cpc']
  ): Promise<AhrefsResponse> {
    if (!this.cache) {
      // Fallback to original client
      return this.client.getKeywordMetrics(keywords, market, metrics);
    }
    
    try {
      // Check cache for all keywords
      const { cached, missing } = await this.cache.get(keywords, market);
      
      const results: any[] = [];
      let fromCache = 0;
      let fromApi = 0;
      
      // Add cached results
      for (const keyword of keywords) {
        if (cached[keyword]) {
          results.push(cached[keyword]);
          fromCache++;
        }
      }
      
      // Fetch missing keywords from API
      if (missing.length > 0) {
        console.log(`Fetching ${missing.length} keywords from Ahrefs API, ${fromCache} from cache`);
        
        try {
          const apiResponse = await this.client.getKeywordMetrics(missing, market, metrics);
          
          if (apiResponse.success) {
            // Add API results
            results.push(...apiResponse.data);
            fromApi = apiResponse.data.length;
            
            // Cache the new results
            await this.cache.set(missing, market, apiResponse.data);
            
            console.log(`Cached ${apiResponse.data.length} new keyword metrics`);
          } else {
            // If API call fails, return cached results only
            console.warn('API call failed, returning cached results only:', apiResponse.error);
            return {
              success: fromCache > 0,
              data: results,
              error: fromCache === 0 ? apiResponse.error : undefined,
              metadata: {
                fromCache,
                fromApi: 0,
                total: fromCache,
                cacheHitRate: fromCache / keywords.length,
                partialFailure: true,
              },
            };
          }
        } catch (error) {
          console.error('API call failed:', error);
          
          if (fromCache === 0) {
            throw error; // No cached data available
          }
          
          // Return partial results from cache
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
          cost: fromApi * 0.001, // Estimated cost per keyword
          savings: fromCache * 0.001, // Estimated savings
        },
      };
    } catch (error) {
      console.error('Cached keyword metrics request failed:', error);
      
      // Fallback to original client
      return this.client.getKeywordMetrics(keywords, market, metrics);
    }
  }
  
  /**
   * Get SERP overview with caching
   */
  async getSerpOverview(
    keyword: string,
    market: string = 'US',
    device: 'desktop' | 'mobile' = 'desktop'
  ): Promise<AhrefsResponse> {
    const cacheSystem = getCacheSystem();
    if (!cacheSystem) {
      return this.client.getSerpOverview(keyword, market, device);
    }
    
    const ahrefs = cacheSystem.getIntegrations().ahrefs;
    
    try {
      // Check cache first
      const cached = await ahrefs.getCachedSerpData(keyword, market, device);
      
      if (cached) {
        console.log(`SERP data for "${keyword}" served from cache`);
        return {
          success: true,
          data: cached,
          metadata: {
            fromCache: true,
            cost: 0,
            savings: 0.005, // Estimated SERP API cost
          },
        };
      }
      
      // Fetch from API
      console.log(`Fetching SERP data for "${keyword}" from Ahrefs API`);
      const response = await this.client.getSerpOverview(keyword, market, device);
      
      if (response.success) {
        // Cache the result
        await ahrefs.cacheSerpData(keyword, market, response.data, device);
        console.log(`Cached SERP data for "${keyword}"`);
      }
      
      return {
        ...response,
        metadata: {
          ...response.metadata,
          fromCache: false,
          cost: 0.005, // Estimated SERP API cost
        },
      };
    } catch (error) {
      console.error('Cached SERP overview request failed:', error);
      return this.client.getSerpOverview(keyword, market, device);
    }
  }
  
  /**
   * Batch keyword metrics with optimized caching
   */
  async getBatchKeywordMetrics(
    keywordBatches: Array<{
      keywords: string[];
      market: string;
      metrics: AhrefsMetrics[];
    }>
  ): Promise<Array<AhrefsResponse & { batch: number }>> {
    const results: Array<AhrefsResponse & { batch: number }> = [];
    
    for (let i = 0; i < keywordBatches.length; i++) {
      const batch = keywordBatches[i];
      try {
        const response = await this.getKeywordMetrics(
          batch.keywords,
          batch.market,
          batch.metrics
        );
        
        results.push({
          ...response,
          batch: i,
        });
      } catch (error) {
        console.error(`Batch ${i} failed:`, error);
        results.push({
          success: false,
          data: [],
          error: error instanceof Error ? error.message : 'Unknown error',
          batch: i,
        });
      }
      
      // Small delay between batches to respect rate limits
      if (i < keywordBatches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return results;
  }
  
  /**
   * Invalidate cache for specific market or keywords
   */
  async invalidateCache(options: {
    market?: string;
    keywords?: string[];
    all?: boolean;
  }): Promise<number> {
    if (!this.cache) {
      console.warn('Cache not available for invalidation');
      return 0;
    }
    
    try {
      if (options.all) {
        return await this.cache.invalidate('all');
      } else if (options.market) {
        return await this.cache.invalidate(options.market);
      } else {
        console.warn('No specific invalidation implemented for keywords yet');
        return 0;
      }
    } catch (error) {
      console.error('Cache invalidation failed:', error);
      return 0;
    }
  }
  
  /**
   * Get cache statistics for this client
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
      recommendations.push('Consider warming cache with common keywords');
    }
    
    if (stats.errors > stats.hits * 0.1) {
      recommendations.push('High error rate - check Redis connectivity');
    }
    
    return {
      enabled: true,
      stats: {
        hitRate: stats.hitRate,
        hits: stats.hits,
        misses: stats.misses,
        errors: stats.errors,
        avgResponseTime: stats.operations.avgLatency,
      },
      recommendations,
    };
  }
  
  /**
   * Proxy other methods to original client
   */
  async getCompetitorKeywords(
    domains: string[],
    market: string = 'US',
    limit: number = 1000
  ): Promise<AhrefsResponse> {
    // Could add caching here too, but for now proxy to original
    return this.client.getCompetitorKeywords(domains, market, limit);
  }
  
  async getDomainMetrics(
    domains: string[],
    metrics: string[] = ['domain_rating', 'ahrefs_rank', 'organic_keywords']
  ): Promise<AhrefsResponse> {
    // Could add caching here too
    return this.client.getDomainMetrics(domains, metrics);
  }
  
  async getKeywordIdeas(
    seedKeywords: string[],
    market: string = 'US',
    limit: number = 1000
  ): Promise<AhrefsResponse> {
    // Could add caching here too
    return this.client.getKeywordIdeas(seedKeywords, market, limit);
  }
  
  // Proxy all other methods from the original client
  getMetrics = this.client.getMetrics?.bind(this.client);
  healthCheck = this.client.healthCheck?.bind(this.client);
}

/**
 * Factory function to create cached Ahrefs client
 */
export function createCachedAhrefsClient(originalClient: AhrefsClient): CachedAhrefsClient {
  return new CachedAhrefsClient(originalClient);
}

/**
 * Migration utility to help transition from base client to cached client
 */
export class AhrefsCacheMigration {
  /**
   * Migrate existing base client cache data to Redis
   */
  static async migrateBaseClientCache(
    baseClient: AhrefsClient
  ): Promise<{
    migrated: number;
    failed: number;
    errors: string[];
  }> {
    const cacheSystem = getCacheSystem();
    if (!cacheSystem) {
      throw new Error('Cache system not initialized');
    }
    
    // Get base client cache (would need to expose this from BaseApiClient)
    // For now, return empty migration result
    console.log('Base client cache migration not yet implemented');
    
    return {
      migrated: 0,
      failed: 0,
      errors: [],
    };
  }
  
  /**
   * Performance comparison between cached and uncached requests
   */
  static async performanceTest(
    cachedClient: CachedAhrefsClient,
    originalClient: AhrefsClient,
    testKeywords: string[],
    market: string = 'US'
  ): Promise<{
    cached: { time: number; cost: number; fromCache: number };
    uncached: { time: number; cost: number };
    improvement: { timeReduction: number; costSavings: number };
  }> {
    console.log('Starting Ahrefs caching performance test...');
    
    // Test cached client
    const cachedStart = Date.now();
    const cachedResponse = await cachedClient.getKeywordMetrics(testKeywords, market);
    const cachedTime = Date.now() - cachedStart;
    
    // Test original client (be careful not to exhaust API limits)
    const uncachedStart = Date.now();
    const uncachedResponse = await originalClient.getKeywordMetrics(
      testKeywords.slice(0, 5), // Limit to 5 keywords for test
      market
    );
    const uncachedTime = Date.now() - uncachedStart;
    
    const results = {
      cached: {
        time: cachedTime,
        cost: cachedResponse.metadata?.cost || 0,
        fromCache: cachedResponse.metadata?.fromCache || 0,
      },
      uncached: {
        time: uncachedTime,
        cost: testKeywords.length * 0.001, // Estimated cost
      },
      improvement: {
        timeReduction: ((uncachedTime - cachedTime) / uncachedTime) * 100,
        costSavings: cachedResponse.metadata?.savings || 0,
      },
    };
    
    console.log('Performance test results:', results);
    return results;
  }
}
