/**
 * Expansion Worker
 * 
 * Background worker for processing Dream 100 expansion jobs.
 * Handles LLM-based seed keyword expansion with Ahrefs metrics enrichment.
 * 
 * Features:
 * - Asynchronous LLM expansion processing
 * - Intelligent batch processing with rate limiting
 * - Progress tracking and real-time updates
 * - Error handling and retry logic
 * - Cost monitoring and budget controls
 * - Quality validation and filtering
 * 
 * @fileoverview Dream 100 expansion background worker
 * @version 1.0.0
 */

import { Job } from 'bullmq';
import * as Sentry from '@sentry/nextjs';
import type { UUID, Keyword, JobProgress, JobMetrics } from '../models';
import type { KeywordStage, KeywordIntent } from '../types/database';
import { ExpansionService } from '../services/expansion';
import { supabase } from '../lib/supabase';

/**
 * Expansion job data structure
 */
export interface ExpansionJobData {
  runId: UUID;
  seedKeywords: string[];
  settings: {
    maxDream100?: number;
    market?: string;
    enableQualityFiltering?: boolean;
    commercialFocus?: boolean;
    scoringWeights?: any;
  };
  userId?: string;
}

/**
 * Expansion job result structure
 */
export interface ExpansionJobResult {
  dreamKeywords: Keyword[];
  metrics: {
    seedCount: number;
    candidatesGenerated: number;
    candidatesFiltered: number;
    finalCount: number;
    processingTime: number;
    apiCalls: {
      anthropic: number;
      ahrefs: number;
    };
    costs: {
      anthropic: number;
      ahrefs: number;
      total: number;
    };
  };
  qualityMetrics: {
    avgVolume: number;
    avgDifficulty: number;
    avgRelevance: number;
    commercialPercentage: number;
  };
}

/**
 * Process expansion job
 */
export async function processExpansionJob(
  job: Job<ExpansionJobData>
): Promise<ExpansionJobResult> {
  const startTime = Date.now();
  const { runId, seedKeywords, settings, userId } = job.data;
  
  console.log(`Processing expansion job ${job.id} for run ${runId}`);
  
  try {
    // Initialize expansion service
    const expansionService = new ExpansionService();
    
    // Update initial progress
    await job.updateProgress({
      stage: 'expansion',
      stepName: 'Initializing',
      current: 0,
      total: 100,
      percentage: 0,
      message: 'Starting Dream 100 expansion',
      metadata: {
        seedCount: seedKeywords.length,
        runId,
      },
    } satisfies JobProgress);

    // Update run status to processing
    await supabase
      .from('runs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        progress: {
          current_stage: 'expansion',
          stages_completed: [],
          keywords_discovered: 0,
          percent_complete: 0,
        },
      })
      .eq('id', runId);

    // Process expansion with progress tracking
    let currentStep = 0;
    const totalSteps = 6; // LLM expansion, Ahrefs enrichment, Intent classification, Relevance scoring, Quality filtering, Final selection
    
    const result = await expansionService.expandToDream100({
      seedKeywords,
      runId,
      settings: {
        maxKeywords: settings.maxDream100 || 100,
        market: settings.market || 'US',
        enableQualityFiltering: settings.enableQualityFiltering ?? true,
        commercialFocus: settings.commercialFocus ?? true,
        scoringWeights: settings.scoringWeights,
      },
      onProgress: async (progress) => {
        const overallProgress = (currentStep / totalSteps) * 100 + (progress.percentage / totalSteps);
        
        await job.updateProgress({
          stage: 'expansion',
          stepName: progress.stepName,
          current: progress.current,
          total: progress.total,
          percentage: Math.min(overallProgress, 100),
          message: progress.message,
          estimatedTimeRemaining: progress.estimatedTimeRemaining,
          metadata: {
            currentStep: currentStep + 1,
            totalSteps,
            seedCount: seedKeywords.length,
            runId,
          },
        } satisfies JobProgress);
        
        // Update database progress
        await supabase
          .from('runs')
          .update({
            progress: {
              current_stage: 'expansion',
              stages_completed: [],
              keywords_discovered: progress.current,
              percent_complete: Math.min(overallProgress, 100),
              estimated_time_remaining: progress.estimatedTimeRemaining,
            },
          })
          .eq('id', runId);
      },
      onStepComplete: async (stepName: string) => {
        currentStep++;
        console.log(`Expansion step '${stepName}' completed (${currentStep}/${totalSteps})`);
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
          total_cost: 0,
        };
        
        if (service === 'ahrefs') {
          currentUsage.ahrefs.requests++;
          currentUsage.ahrefs.cost += cost;
        } else if (service === 'anthropic') {
          currentUsage.anthropic.requests++;
          currentUsage.anthropic.cost += cost;
        }
        currentUsage.total_cost += cost;
        
        await supabase
          .from('runs')
          .update({ api_usage: currentUsage })
          .eq('id', runId);
      },
    });

    // Calculate quality metrics
    const qualityMetrics = calculateQualityMetrics(result.keywords);
    
    // Update final progress
    await job.updateProgress({
      stage: 'expansion',
      stepName: 'Completed',
      current: result.keywords.length,
      total: result.keywords.length,
      percentage: 100,
      message: `Dream 100 expansion completed with ${result.keywords.length} keywords`,
      metadata: {
        finalCount: result.keywords.length,
        qualityMetrics,
        runId,
      },
    } satisfies JobProgress);

    // Update run with completed expansion stage
    await supabase
      .from('runs')
      .update({
        progress: {
          current_stage: 'expansion',
          stages_completed: ['expansion'],
          keywords_discovered: result.keywords.length,
          percent_complete: 20, // Expansion is ~20% of total pipeline
        },
        total_keywords: result.keywords.length,
      })
      .eq('id', runId);

    const processingTime = Date.now() - startTime;
    console.log(`Expansion job ${job.id} completed in ${processingTime}ms with ${result.keywords.length} keywords`);

    // Log success to Sentry
    Sentry.addBreadcrumb({
      message: 'Expansion job completed successfully',
      category: 'job',
      level: 'info',
      data: {
        jobId: job.id,
        runId,
        keywordCount: result.keywords.length,
        processingTime,
      },
    });

    return {
      dreamKeywords: result.keywords,
      metrics: {
        seedCount: seedKeywords.length,
        candidatesGenerated: result.metrics?.candidatesGenerated || 0,
        candidatesFiltered: result.metrics?.candidatesFiltered || 0,
        finalCount: result.keywords.length,
        processingTime,
        apiCalls: result.metrics?.apiCalls || { anthropic: 0, ahrefs: 0 },
        costs: result.metrics?.costs || { anthropic: 0, ahrefs: 0, total: 0 },
      },
      qualityMetrics,
    };

  } catch (error) {
    console.error(`Expansion job ${job.id} failed:`, error);
    
    // Update run status to failed
    await supabase
      .from('runs')
      .update({
        status: 'failed',
        error_logs: {
          stage: 'expansion',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        },
      })
      .eq('id', runId);

    // Log error to Sentry
    Sentry.captureException(error, {
      tags: {
        jobType: 'expansion',
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
 * Calculate quality metrics for Dream 100 keywords
 */
function calculateQualityMetrics(keywords: Keyword[]): {
  avgVolume: number;
  avgDifficulty: number;
  avgRelevance: number;
  commercialPercentage: number;
} {
  if (keywords.length === 0) {
    return {
      avgVolume: 0,
      avgDifficulty: 0,
      avgRelevance: 0,
      commercialPercentage: 0,
    };
  }

  const totalVolume = keywords.reduce((sum, k) => sum + k.volume, 0);
  const totalDifficulty = keywords.reduce((sum, k) => sum + k.difficulty, 0);
  const totalRelevance = keywords.reduce((sum, k) => sum + k.relevance, 0);
  const commercialCount = keywords.filter(k => 
    k.intent === 'commercial' || k.intent === 'transactional'
  ).length;

  return {
    avgVolume: Math.round(totalVolume / keywords.length),
    avgDifficulty: Math.round((totalDifficulty / keywords.length) * 100) / 100,
    avgRelevance: Math.round((totalRelevance / keywords.length) * 100) / 100,
    commercialPercentage: Math.round((commercialCount / keywords.length) * 100),
  };
}

/**
 * Validate expansion job data
 */
export function validateExpansionJobData(data: any): data is ExpansionJobData {
  return (
    data &&
    typeof data.runId === 'string' &&
    Array.isArray(data.seedKeywords) &&
    data.seedKeywords.length > 0 &&
    data.seedKeywords.every((k: any) => typeof k === 'string') &&
    typeof data.settings === 'object'
  );
}

/**
 * Estimate expansion job duration
 */
export function estimateExpansionJobDuration(data: ExpansionJobData): number {
  const baseTimePerSeed = 30000; // 30 seconds per seed keyword
  const maxDream100 = data.settings.maxDream100 || 100;
  const complexityMultiplier = maxDream100 / 100;
  
  return data.seedKeywords.length * baseTimePerSeed * complexityMultiplier;
}

export default processExpansionJob;