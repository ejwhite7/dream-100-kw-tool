/**
 * Universe Worker
 * 
 * Background worker for processing Universe expansion jobs.
 * Handles Tier-2 and Tier-3 keyword expansion from Dream 100 keywords.
 * 
 * Features:
 * - Parallel tier expansion processing
 * - Metrics enrichment with batched API calls
 * - Competitor analysis and SERP scraping
 * - Progress tracking with detailed metrics
 * - Quality control and filtering
 * - Cost optimization and budget monitoring
 * 
 * @fileoverview Universe expansion background worker
 * @version 1.0.0
 */

import { Job } from 'bullmq';
import * as Sentry from '@sentry/nextjs';
import type { UUID, Keyword, JobProgress, JobMetrics } from '../models';
import type { KeywordStage, KeywordIntent } from '../types/database';
import { UniverseService } from '../services/universe';
import { supabase } from '../lib/supabase';

/**
 * Universe job data structure
 */
export interface UniverseJobData {
  runId: UUID;
  dreamKeywords: Keyword[];
  settings: {
    maxTier2PerDream?: number;
    maxTier3PerTier2?: number;
    maxTotalKeywords?: number;
    enableCompetitorAnalysis?: boolean;
    enableSerpScraping?: boolean;
    market?: string;
    qualityThreshold?: number;
  };
  userId?: string;
}

/**
 * Universe job result structure
 */
export interface UniverseJobResult {
  tier2Keywords: Keyword[];
  tier3Keywords: Keyword[];
  allKeywords: Keyword[];
  metrics: {
    dreamCount: number;
    tier2Generated: number;
    tier3Generated: number;
    totalKeywords: number;
    competitorsFound: number;
    serpUrlsScraped: number;
    processingTime: number;
    apiCalls: {
      anthropic: number;
      ahrefs: number;
      scraping: number;
    };
    costs: {
      anthropic: number;
      ahrefs: number;
      total: number;
    };
  };
  qualityMetrics: {
    tier2: {
      avgVolume: number;
      avgDifficulty: number;
      avgRelevance: number;
    };
    tier3: {
      avgVolume: number;
      avgDifficulty: number;
      avgRelevance: number;
    };
  };
}

/**
 * Process universe expansion job
 */
export async function processUniverseJob(
  job: Job<UniverseJobData>
): Promise<UniverseJobResult> {
  const startTime = Date.now();
  const { runId, dreamKeywords, settings, userId } = job.data;
  
  console.log(`Processing universe job ${job.id} for run ${runId} with ${dreamKeywords.length} dream keywords`);
  
  try {
    // Initialize universe service
    const universeService = new UniverseService();
    
    // Update initial progress
    await job.updateProgress({
      stage: 'universe',
      stepName: 'Initializing',
      current: 0,
      total: 100,
      percentage: 0,
      message: 'Starting universe expansion',
      metadata: {
        dreamCount: dreamKeywords.length,
        runId,
        maxTier2: settings.maxTier2PerDream || 10,
        maxTier3: settings.maxTier3PerTier2 || 10,
      },
    } satisfies JobProgress);

    // Update run status
    await supabase
      .from('runs')
      .update({
        status: 'processing',
        progress: {
          current_stage: 'universe',
          stages_completed: ['expansion'],
          keywords_discovered: dreamKeywords.length,
          percent_complete: 20,
        },
      })
      .eq('id', runId);

    // Process universe expansion with progress tracking
    let currentStep = 0;
    const totalSteps = 5; // Tier-2 expansion, Tier-3 expansion, Metrics enrichment, Competitor analysis, Quality filtering
    
    const result = await universeService.expandUniverse({
      dreamKeywords,
      runId,
      settings: {
        maxTier2PerDream: settings.maxTier2PerDream || 10,
        maxTier3PerTier2: settings.maxTier3PerTier2 || 10,
        maxTotalKeywords: settings.maxTotalKeywords || 10000,
        enableCompetitorAnalysis: settings.enableCompetitorAnalysis ?? true,
        enableSerpScraping: settings.enableSerpScraping ?? true,
        market: settings.market || 'US',
        qualityThreshold: settings.qualityThreshold || 0.3,
      },
      onProgress: async (progress) => {
        const overallProgress = (currentStep / totalSteps) * 100 + (progress.percentage / totalSteps);
        
        await job.updateProgress({
          stage: 'universe',
          stepName: progress.stepName,
          current: progress.current,
          total: progress.total,
          percentage: Math.min(overallProgress, 100),
          message: progress.message,
          estimatedTimeRemaining: progress.estimatedTimeRemaining,
          metadata: {
            currentStep: currentStep + 1,
            totalSteps,
            dreamCount: dreamKeywords.length,
            runId,
          },
        } satisfies JobProgress);
        
        // Update database progress
        await supabase
          .from('runs')
          .update({
            progress: {
              current_stage: 'universe',
              stages_completed: ['expansion'],
              keywords_discovered: progress.current,
              percent_complete: 20 + Math.min(overallProgress * 0.4, 40), // Universe is ~40% of pipeline
              estimated_time_remaining: progress.estimatedTimeRemaining,
            },
          })
          .eq('id', runId);
      },
      onStepComplete: async (stepName: string) => {
        currentStep++;
        console.log(`Universe step '${stepName}' completed (${currentStep}/${totalSteps})`);
      },
      onApiCall: async (service: string, cost: number) => {
        // Track API usage in database
        const { data: currentRun } = await supabase
          .from('runs')
          .select('api_usage')
          .eq('id', runId)
          .single();
        
        const currentUsage = (currentRun?.api_usage as any) || {
          ahrefs: { requests: 0, cost: 0 },
          anthropic: { requests: 0, tokens: 0, cost: 0 },
          scraping: { requests: 0, cost: 0 },
          total_cost: 0,
        };
        
        if (service === 'ahrefs') {
          currentUsage.ahrefs.requests++;
          currentUsage.ahrefs.cost += cost;
        } else if (service === 'anthropic') {
          currentUsage.anthropic.requests++;
          currentUsage.anthropic.cost += cost;
        } else if (service === 'scraping') {
          currentUsage.scraping = currentUsage.scraping || { requests: 0, cost: 0 };
          currentUsage.scraping.requests++;
          currentUsage.scraping.cost += cost;
        }
        currentUsage.total_cost += cost;
        
        await supabase
          .from('runs')
          .update({ api_usage: currentUsage })
          .eq('id', runId);
      },
    });

    // Calculate quality metrics
    const qualityMetrics = calculateUniverseQualityMetrics(
      result.tier2Keywords,
      result.tier3Keywords
    );
    
    const totalKeywords = dreamKeywords.length + result.tier2Keywords.length + result.tier3Keywords.length;
    
    // Update final progress
    await job.updateProgress({
      stage: 'universe',
      stepName: 'Completed',
      current: totalKeywords,
      total: totalKeywords,
      percentage: 100,
      message: `Universe expansion completed with ${totalKeywords} total keywords`,
      metadata: {
        tier2Count: result.tier2Keywords.length,
        tier3Count: result.tier3Keywords.length,
        totalCount: totalKeywords,
        qualityMetrics,
        runId,
      },
    } satisfies JobProgress);

    // Update run with completed universe stage
    await supabase
      .from('runs')
      .update({
        progress: {
          current_stage: 'universe',
          stages_completed: ['expansion', 'universe'],
          keywords_discovered: totalKeywords,
          percent_complete: 60, // Universe completion brings us to ~60%
          competitors_found: result.metrics?.competitorsFound || 0,
        },
        total_keywords: totalKeywords,
      })
      .eq('id', runId);

    const processingTime = Date.now() - startTime;
    console.log(`Universe job ${job.id} completed in ${processingTime}ms with ${totalKeywords} total keywords`);

    // Log success to Sentry
    Sentry.addBreadcrumb({
      message: 'Universe job completed successfully',
      category: 'job',
      level: 'info',
      data: {
        jobId: job.id,
        runId,
        totalKeywords,
        tier2Count: result.tier2Keywords.length,
        tier3Count: result.tier3Keywords.length,
        processingTime,
      },
    });

    return {
      tier2Keywords: result.tier2Keywords,
      tier3Keywords: result.tier3Keywords,
      allKeywords: [...dreamKeywords, ...result.tier2Keywords, ...result.tier3Keywords],
      metrics: {
        dreamCount: dreamKeywords.length,
        tier2Generated: result.tier2Keywords.length,
        tier3Generated: result.tier3Keywords.length,
        totalKeywords,
        competitorsFound: result.metrics?.competitorsFound || 0,
        serpUrlsScraped: result.metrics?.serpUrlsScraped || 0,
        processingTime,
        apiCalls: result.metrics?.apiCalls || { anthropic: 0, ahrefs: 0, scraping: 0 },
        costs: result.metrics?.costs || { anthropic: 0, ahrefs: 0, total: 0 },
      },
      qualityMetrics,
    };

  } catch (error) {
    console.error(`Universe job ${job.id} failed:`, error);
    
    // Update run status to failed
    await supabase
      .from('runs')
      .update({
        status: 'failed',
        error_logs: {
          stage: 'universe',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        },
      })
      .eq('id', runId);

    // Log error to Sentry
    Sentry.captureException(error, {
      tags: {
        jobType: 'universe',
        jobId: job.id,
        runId,
      },
      extra: {
        jobData: job.data,
        attemptsMade: job.attemptsMade,
      },
    });

    throw error;
  }
}

/**
 * Calculate quality metrics for universe keywords
 */
function calculateUniverseQualityMetrics(
  tier2Keywords: Keyword[],
  tier3Keywords: Keyword[]
): {
  tier2: { avgVolume: number; avgDifficulty: number; avgRelevance: number };
  tier3: { avgVolume: number; avgDifficulty: number; avgRelevance: number };
} {
  const calculateTierMetrics = (keywords: Keyword[]) => {
    if (keywords.length === 0) {
      return { avgVolume: 0, avgDifficulty: 0, avgRelevance: 0 };
    }

    const totalVolume = keywords.reduce((sum, k) => sum + k.volume, 0);
    const totalDifficulty = keywords.reduce((sum, k) => sum + k.difficulty, 0);
    const totalRelevance = keywords.reduce((sum, k) => sum + k.relevance, 0);

    return {
      avgVolume: Math.round(totalVolume / keywords.length),
      avgDifficulty: Math.round((totalDifficulty / keywords.length) * 100) / 100,
      avgRelevance: Math.round((totalRelevance / keywords.length) * 100) / 100,
    };
  };

  return {
    tier2: calculateTierMetrics(tier2Keywords),
    tier3: calculateTierMetrics(tier3Keywords),
  };
}

/**
 * Validate universe job data
 */
export function validateUniverseJobData(data: any): data is UniverseJobData {
  return (
    data &&
    typeof data.runId === 'string' &&
    Array.isArray(data.dreamKeywords) &&
    data.dreamKeywords.length > 0 &&
    typeof data.settings === 'object'
  );
}

/**
 * Estimate universe job duration
 */
export function estimateUniverseJobDuration(data: UniverseJobData): number {
  const baseTimePerDream = 45000; // 45 seconds per dream keyword
  const tier2Multiplier = (data.settings.maxTier2PerDream || 10) / 10;
  const tier3Multiplier = (data.settings.maxTier3PerTier2 || 10) / 10;
  const competitorMultiplier = data.settings.enableCompetitorAnalysis ? 1.5 : 1.0;
  const serpMultiplier = data.settings.enableSerpScraping ? 1.3 : 1.0;
  
  return (
    data.dreamKeywords.length * 
    baseTimePerDream * 
    tier2Multiplier * 
    tier3Multiplier * 
    competitorMultiplier * 
    serpMultiplier
  );
}

/**
 * Calculate universe job complexity score
 */
export function calculateUniverseJobComplexity(data: UniverseJobData): {
  score: number;
  factors: {
    keywordCount: number;
    expansionRatio: number;
    competitorAnalysis: boolean;
    serpScraping: boolean;
  };
} {
  const keywordCount = data.dreamKeywords.length;
  const tier2Per = data.settings.maxTier2PerDream || 10;
  const tier3Per = data.settings.maxTier3PerTier2 || 10;
  const expansionRatio = tier2Per * tier3Per;
  
  let score = keywordCount * 0.1; // Base score from keyword count
  score += expansionRatio * 0.05; // Expansion complexity
  
  if (data.settings.enableCompetitorAnalysis) score += 20;
  if (data.settings.enableSerpScraping) score += 15;
  
  // Cap at 100
  score = Math.min(score, 100);
  
  return {
    score,
    factors: {
      keywordCount,
      expansionRatio,
      competitorAnalysis: data.settings.enableCompetitorAnalysis ?? true,
      serpScraping: data.settings.enableSerpScraping ?? true,
    },
  };
}

export default processUniverseJob;