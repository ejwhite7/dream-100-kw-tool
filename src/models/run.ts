/**
 * Run Data Models
 * 
 * Processing run metadata, status tracking, and progress monitoring
 * for the complete keyword research pipeline.
 */

import { z } from 'zod';
import type { RunStatus } from '../types/database';
import type { UUID, Timestamp, JSONValue } from './index';
import type { ScoringWeights } from './scoring';

/**
 * Core run interface matching database schema
 */
export interface Run {
  readonly id: UUID;
  readonly userId: UUID;
  readonly seedKeywords: string[];
  readonly market: string;
  readonly status: RunStatus;
  readonly settings: RunSettings;
  readonly apiUsage: ApiUsage;
  readonly errorLogs: ErrorLog[];
  readonly progress: RunProgress;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
  readonly startedAt: Timestamp | null;
  readonly completedAt: Timestamp | null;
  readonly totalKeywords: number;
  readonly totalClusters: number;
}

/**
 * Run configuration settings
 */
export interface RunSettings {
  readonly maxKeywords: number;
  readonly maxDream100: number;
  readonly maxTier2PerDream: number;
  readonly maxTier3PerTier2: number;
  readonly scoringWeights: ScoringWeights;
  readonly enableCompetitorScraping: boolean;
  readonly similarityThreshold: number;
  readonly quickWinThreshold: number;
  readonly targetMarket: string;
  readonly language: string;
  readonly includeNegativeKeywords: string[];
  readonly industryContext?: string;
  readonly contentFocus?: 'blog' | 'product' | 'service' | 'mixed';
  readonly difficultyPreference?: 'easy' | 'medium' | 'hard' | 'mixed';
  readonly volumePreference?: 'high' | 'medium' | 'low' | 'mixed';
}

/**
 * API usage tracking across all providers
 */
export interface ApiUsage {
  readonly ahrefs: {
    readonly requests: number;
    readonly cost: number;
    readonly remainingQuota: number;
    readonly quotaResetAt: Timestamp;
    readonly errors: number;
  };
  readonly anthropic: {
    readonly requests: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cost: number;
    readonly errors: number;
  };
  readonly scraper: {
    readonly requests: number;
    readonly successfulScrapes: number;
    readonly failedScrapes: number;
    readonly blockedRequests: number;
    readonly totalPages: number;
  };
  readonly totalCost: number;
  readonly budgetLimit: number;
  readonly budgetRemaining: number;
}

/**
 * Detailed error logging for debugging and monitoring
 */
export interface ErrorLog {
  readonly timestamp: Timestamp;
  readonly stage: ProcessingStage;
  readonly level: 'info' | 'warning' | 'error' | 'critical';
  readonly message: string;
  readonly details?: JSONValue;
  readonly stackTrace?: string;
  readonly provider?: 'ahrefs' | 'anthropic' | 'scraper' | 'system';
  readonly retryable: boolean;
  readonly retryCount?: number;
}

/**
 * Run progress tracking with detailed stage information
 */
export interface RunProgress {
  readonly currentStage: ProcessingStage;
  readonly stagesCompleted: ProcessingStage[];
  readonly keywordsDiscovered: number;
  readonly clustersCreated: number;
  readonly competitorsFound: number;
  readonly estimatedTimeRemaining: number; // minutes
  readonly percentComplete: number; // 0-100
  readonly stageProgress: Record<ProcessingStage, StageProgress>;
  readonly throughput: {
    readonly keywordsPerMinute: number;
    readonly apiRequestsPerMinute: number;
  };
}

/**
 * Individual stage progress details
 */
export interface StageProgress {
  readonly stage: ProcessingStage;
  readonly status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  readonly startedAt: Timestamp | null;
  readonly completedAt: Timestamp | null;
  readonly progress: number; // 0-100
  readonly itemsProcessed: number;
  readonly totalItems: number;
  readonly errors: number;
  readonly warnings: number;
}

/**
 * Processing stages in the pipeline
 */
export type ProcessingStage = 
  | 'initialization'
  | 'dream100_generation'
  | 'tier2_expansion'
  | 'tier3_expansion'
  | 'metrics_enrichment'
  | 'competitor_discovery'
  | 'content_scraping'
  | 'semantic_clustering'
  | 'scoring_calculation'
  | 'roadmap_generation'
  | 'export_preparation'
  | 'finalization';

/**
 * Run creation input
 */
export interface CreateRunInput {
  readonly userId: UUID;
  readonly seedKeywords: string[];
  readonly market?: string;
  readonly settings?: Partial<RunSettings>;
  readonly budgetLimit?: number;
}

/**
 * Run update input
 */
export interface UpdateRunInput {
  readonly status?: RunStatus;
  readonly settings?: Partial<RunSettings>;
  readonly startedAt?: Timestamp;
  readonly completedAt?: Timestamp;
  readonly totalKeywords?: number;
  readonly totalClusters?: number;
}

/**
 * Run with expanded relationships
 */
export interface RunWithRelations extends Run {
  readonly keywords: Array<{
    readonly id: UUID;
    readonly keyword: string;
    readonly stage: string;
    readonly volume: number;
    readonly difficulty: number;
    readonly blendedScore: number;
  }>;
  readonly clusters: Array<{
    readonly id: UUID;
    readonly label: string;
    readonly size: number;
    readonly score: number;
  }>;
  readonly roadmapItems: Array<{
    readonly id: UUID;
    readonly postId: string;
    readonly primaryKeyword: string;
    readonly dueDate: string;
  }>;
}

/**
 * Run search and filtering parameters
 */
export interface RunSearchParams {
  readonly userId?: UUID;
  readonly status?: RunStatus | RunStatus[];
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly seedKeywordSearch?: string;
  readonly minKeywords?: number;
  readonly maxKeywords?: number;
  readonly limit?: number;
  readonly offset?: number;
  readonly orderBy?: 'createdAt' | 'completedAt' | 'totalKeywords' | 'totalClusters';
  readonly orderDirection?: 'asc' | 'desc';
}

/**
 * Run analytics and performance metrics
 */
export interface RunAnalytics {
  readonly runId: UUID;
  readonly performance: {
    readonly totalProcessingTime: number; // minutes
    readonly avgProcessingTimePerKeyword: number; // seconds
    readonly throughputMetrics: {
      readonly keywordsPerHour: number;
      readonly clustersPerHour: number;
      readonly apiRequestsPerMinute: number;
    };
  };
  readonly quality: {
    readonly keywordRelevanceScore: number; // 0-1
    readonly clusterCoherenceScore: number; // 0-1
    readonly duplicateKeywordRatio: number; // 0-1
    readonly outlierRatio: number; // 0-1
  };
  readonly costs: {
    readonly totalCost: number;
    readonly costPerKeyword: number;
    readonly costBreakdown: {
      readonly ahrefs: number;
      readonly anthropic: number;
      readonly infrastructure: number;
    };
  };
  readonly errors: {
    readonly totalErrors: number;
    readonly errorsByStage: Record<ProcessingStage, number>;
    readonly errorsByProvider: Record<string, number>;
    readonly criticalErrors: number;
  };
}

/**
 * Run comparison for optimization and benchmarking
 */
export interface RunComparison {
  readonly baselineRun: UUID;
  readonly comparisonRun: UUID;
  readonly metrics: {
    readonly processingTimeImprovement: number; // percentage
    readonly costImprovement: number; // percentage
    readonly qualityImprovement: number; // percentage
    readonly errorReduction: number; // percentage
  };
  readonly recommendations: string[];
}

/**
 * Run export configuration
 */
export interface RunExportConfig {
  readonly runId: UUID;
  readonly formats: Array<'csv' | 'json' | 'xlsx' | 'pdf'>;
  readonly includeKeywords: boolean;
  readonly includeClusters: boolean;
  readonly includeRoadmap: boolean;
  readonly includeAnalytics: boolean;
  readonly filterCriteria?: {
    readonly minScore?: number;
    readonly quickWinsOnly?: boolean;
    readonly specificClusters?: UUID[];
  };
}

/**
 * Validation schemas using Zod
 */
export const ProcessingStageSchema = z.enum([
  'initialization',
  'dream100_generation', 
  'tier2_expansion',
  'tier3_expansion',
  'metrics_enrichment',
  'competitor_discovery',
  'content_scraping',
  'semantic_clustering',
  'scoring_calculation',
  'roadmap_generation',
  'export_preparation',
  'finalization'
]);

export const RunSettingsSchema = z.object({
  maxKeywords: z.number().int().min(100).max(10000).default(10000),
  maxDream100: z.number().int().min(10).max(200).default(100),
  maxTier2PerDream: z.number().int().min(5).max(20).default(10),
  maxTier3PerTier2: z.number().int().min(5).max(20).default(10),
  scoringWeights: z.object({
    dream100: z.object({
      volume: z.number().min(0).max(1),
      intent: z.number().min(0).max(1),
      relevance: z.number().min(0).max(1),
      trend: z.number().min(0).max(1),
      ease: z.number().min(0).max(1)
    }),
    tier2: z.object({
      volume: z.number().min(0).max(1),
      ease: z.number().min(0).max(1),
      relevance: z.number().min(0).max(1),
      intent: z.number().min(0).max(1),
      trend: z.number().min(0).max(1)
    }),
    tier3: z.object({
      ease: z.number().min(0).max(1),
      relevance: z.number().min(0).max(1),
      volume: z.number().min(0).max(1),
      intent: z.number().min(0).max(1),
      trend: z.number().min(0).max(1)
    })
  }),
  enableCompetitorScraping: z.boolean().default(true),
  similarityThreshold: z.number().min(0.1).max(0.9).default(0.7),
  quickWinThreshold: z.number().min(0.5).max(0.9).default(0.7),
  targetMarket: z.string().min(2).max(10).default('US'),
  language: z.string().min(2).max(10).default('en'),
  includeNegativeKeywords: z.array(z.string().min(1).max(100)).default([]),
  industryContext: z.string().min(1).max(200).optional(),
  contentFocus: z.enum(['blog', 'product', 'service', 'mixed']).default('blog'),
  difficultyPreference: z.enum(['easy', 'medium', 'hard', 'mixed']).default('mixed'),
  volumePreference: z.enum(['high', 'medium', 'low', 'mixed']).default('mixed')
});

export const CreateRunInputSchema = z.object({
  userId: z.string().uuid(),
  seedKeywords: z.array(z.string().min(1).max(100))
    .min(1, "At least one seed keyword required")
    .max(5, "Maximum 5 seed keywords allowed")
    .refine(keywords => {
      const unique = new Set(keywords.map(k => k.toLowerCase().trim()));
      return unique.size === keywords.length;
    }, {
      message: "Seed keywords must be unique"
    }),
  market: z.string().min(2).max(10).default('US'),
  settings: RunSettingsSchema.partial().optional(),
  budgetLimit: z.number().min(1).max(1000).default(100)
});

export const UpdateRunInputSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']).optional(),
  settings: RunSettingsSchema.partial().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  totalKeywords: z.number().int().min(0).optional(),
  totalClusters: z.number().int().min(0).optional()
});

export const RunSearchParamsSchema = z.object({
  userId: z.string().uuid().optional(),
  status: z.union([
    z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']),
    z.array(z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']))
  ]).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  seedKeywordSearch: z.string().min(1).max(100).optional(),
  minKeywords: z.number().int().min(0).optional(),
  maxKeywords: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(1000).default(50),
  offset: z.number().int().min(0).default(0),
  orderBy: z.enum(['createdAt', 'completedAt', 'totalKeywords', 'totalClusters']).default('createdAt'),
  orderDirection: z.enum(['asc', 'desc']).default('desc')
}).refine(data => {
  if (data.dateFrom && data.dateTo) {
    return new Date(data.dateFrom) <= new Date(data.dateTo);
  }
  return true;
}, {
  message: "dateFrom must be before or equal to dateTo"
}).refine(data => {
  if (data.minKeywords !== undefined && data.maxKeywords !== undefined) {
    return data.minKeywords <= data.maxKeywords;
  }
  return true;
}, {
  message: "minKeywords must be less than or equal to maxKeywords"
});

/**
 * Type guards for runtime type checking
 */
export const isRunStatus = (value: unknown): value is RunStatus => {
  return typeof value === 'string' && 
    ['pending', 'processing', 'completed', 'failed', 'cancelled'].includes(value);
};

export const isProcessingStage = (value: unknown): value is ProcessingStage => {
  return typeof value === 'string' && [
    'initialization', 'dream100_generation', 'tier2_expansion', 'tier3_expansion',
    'metrics_enrichment', 'competitor_discovery', 'content_scraping',
    'semantic_clustering', 'scoring_calculation', 'roadmap_generation',
    'export_preparation', 'finalization'
  ].includes(value);
};

export const isRun = (value: unknown): value is Run => {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  
  return (
    typeof obj.id === 'string' &&
    typeof obj.userId === 'string' &&
    Array.isArray(obj.seedKeywords) &&
    typeof obj.market === 'string' &&
    isRunStatus(obj.status) &&
    typeof obj.totalKeywords === 'number' &&
    typeof obj.totalClusters === 'number' &&
    typeof obj.createdAt === 'string' &&
    typeof obj.updatedAt === 'string'
  );
};

/**
 * Utility functions for run operations
 */
export const getDefaultRunSettings = (): RunSettings => ({
  maxKeywords: 10000,
  maxDream100: 100,
  maxTier2PerDream: 10,
  maxTier3PerTier2: 10,
  scoringWeights: {
    dream100: {
      volume: 0.40,
      intent: 0.30,
      relevance: 0.15,
      trend: 0.10,
      ease: 0.05
    },
    tier2: {
      volume: 0.35,
      ease: 0.25,
      relevance: 0.20,
      intent: 0.15,
      trend: 0.05
    },
    tier3: {
      ease: 0.35,
      relevance: 0.30,
      volume: 0.20,
      intent: 0.10,
      trend: 0.05
    }
  },
  enableCompetitorScraping: true,
  similarityThreshold: 0.7,
  quickWinThreshold: 0.7,
  targetMarket: 'US',
  language: 'en',
  includeNegativeKeywords: [],
  contentFocus: 'blog'
});

export const calculateRunProgress = (stageProgress: Record<ProcessingStage, StageProgress>): number => {
  const stages: ProcessingStage[] = [
    'initialization', 'dream100_generation', 'tier2_expansion', 'tier3_expansion',
    'metrics_enrichment', 'competitor_discovery', 'content_scraping',
    'semantic_clustering', 'scoring_calculation', 'roadmap_generation',
    'export_preparation', 'finalization'
  ];
  
  const stageWeights: Record<ProcessingStage, number> = {
    'initialization': 5,
    'dream100_generation': 10,
    'tier2_expansion': 15,
    'tier3_expansion': 15,
    'metrics_enrichment': 20,
    'competitor_discovery': 10,
    'content_scraping': 10,
    'semantic_clustering': 10,
    'scoring_calculation': 3,
    'roadmap_generation': 1,
    'export_preparation': 1,
    'finalization': 0
  };
  
  const totalWeight = Object.values(stageWeights).reduce((sum, weight) => sum + weight, 0);
  
  let completedWeight = 0;
  stages.forEach(stage => {
    const progress = stageProgress[stage];
    if (progress && progress.status === 'completed') {
      completedWeight += stageWeights[stage];
    } else if (progress && progress.status === 'processing') {
      completedWeight += (stageWeights[stage] * progress.progress) / 100;
    }
  });
  
  return Math.min(100, Math.round((completedWeight / totalWeight) * 100));
};

export const estimateRemainingTime = (progress: RunProgress): number => {
  const { currentStage, stageProgress, throughput } = progress;
  
  const remainingStages: ProcessingStage[] = [
    'tier2_expansion', 'tier3_expansion', 'metrics_enrichment',
    'competitor_discovery', 'content_scraping', 'semantic_clustering',
    'scoring_calculation', 'roadmap_generation', 'export_preparation', 'finalization'
  ];
  
  const currentStageIndex = remainingStages.indexOf(currentStage);
  if (currentStageIndex === -1) return 0;
  
  const upcomingStages = remainingStages.slice(currentStageIndex + 1);
  const currentStageProgress = stageProgress[currentStage];
  
  let estimatedMinutes = 0;
  
  // Time for current stage
  if (currentStageProgress && currentStageProgress.totalItems > 0) {
    const remainingItems = currentStageProgress.totalItems - currentStageProgress.itemsProcessed;
    const itemsPerMinute = throughput.keywordsPerMinute || 50; // fallback
    estimatedMinutes += remainingItems / itemsPerMinute;
  }
  
  // Time for upcoming stages (rough estimates)
  const stageEstimates: Record<ProcessingStage, number> = {
    'initialization': 1,
    'dream100_generation': 3,
    'tier2_expansion': 5,
    'tier3_expansion': 8,
    'metrics_enrichment': 10,
    'competitor_discovery': 4,
    'content_scraping': 6,
    'semantic_clustering': 3,
    'scoring_calculation': 1,
    'roadmap_generation': 1,
    'export_preparation': 1,
    'finalization': 0
  };
  
  upcomingStages.forEach(stage => {
    estimatedMinutes += stageEstimates[stage];
  });
  
  return Math.round(estimatedMinutes);
};

export const getRunStatusColor = (status: RunStatus): string => {
  switch (status) {
    case 'pending': return 'gray';
    case 'processing': return 'blue';
    case 'completed': return 'green';
    case 'failed': return 'red';
    case 'cancelled': return 'orange';
    default: return 'gray';
  }
};

export const getStageDisplayName = (stage: ProcessingStage): string => {
  const displayNames: Record<ProcessingStage, string> = {
    'initialization': 'Initializing',
    'dream100_generation': 'Generating Dream 100',
    'tier2_expansion': 'Expanding Tier 2 Keywords',
    'tier3_expansion': 'Expanding Tier 3 Keywords',
    'metrics_enrichment': 'Enriching with Metrics',
    'competitor_discovery': 'Discovering Competitors',
    'content_scraping': 'Scraping Content',
    'semantic_clustering': 'Clustering Keywords',
    'scoring_calculation': 'Calculating Scores',
    'roadmap_generation': 'Generating Roadmap',
    'export_preparation': 'Preparing Exports',
    'finalization': 'Finalizing'
  };
  
  return displayNames[stage] || stage;
};