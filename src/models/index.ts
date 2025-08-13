/**
 * Dream 100 Keyword Engine - Core Type Definitions
 * 
 * Comprehensive TypeScript interfaces and data models for the keyword research pipeline.
 * Includes database types, API integrations, pipeline structures, and validation schemas.
 * 
 * @fileoverview Core type definitions with full TypeScript strict mode compliance
 * @version 1.0.0
 * @author Dream 100 Team
 */

// Re-export all model types
export * from './keyword';
export * from './cluster';
export * from './run';
export * from './competitor';
export * from './scoring';
export * from './export';
export * from './validation';

// Explicit re-exports to avoid conflicts
export type {
  RoadmapItem,
  CreateRoadmapItemInput,
  UpdateRoadmapItemInput,
  RoadmapItemWithCluster,
  EditorialRoadmap,
  RoadmapAnalytics,
  RoadmapGenerationConfig,
  ContentCalendar,
  CalendarPeriod,
  CalendarFilters,
  RoadmapSearchParams,
  RoadmapOptimization,
  OptimizationImprovement,
  TimelineAdjustment,
  TeamReassignment,
  RoadmapExportConfig,
  RoadmapStageSchema,
  CreateRoadmapItemInputSchema,
  UpdateRoadmapItemInputSchema,
  RoadmapGenerationConfigSchema,
  RoadmapSearchParamsSchema
} from './roadmap';

export type {
  Settings,
  UserPreferences,
  NotificationSettings,
  InterfaceSettings,
  DefaultSettings,
  IntegrationSettings,
  PrivacySettings,
  BillingSettings,
  CreateSettingsInput,
  UpdateSettingsInput,
  ApiKeyInfo,
  SettingsValidation,
  UsageAnalytics,
  TeamSettings,
  TeamLimits,
  TeamPermissions
} from './settings';

export type {
  PipelineJob,
  JobStatus,
  JobData,
  StageConfig,
  ResourceRequirements,
  ResourceLimits,
  RetryStrategy,
  JobResult,
  JobError,
  JobMetrics,
  JobMetadata,
  JobArtifact,
  PipelineWorkflow,
  WorkflowStage,
  WorkflowDependency,
  WorkflowConfig,
  PipelineExecution,
  ExecutionStatus,
  ExecutionProgress,
  ExecutionError,
  CreateJobInput,
  JobQueueConfig,
  WorkerNode,
  PipelineAnalytics
} from './pipeline';

export type {
  PaginationParams,
  PaginatedResponse,
  SortParams,
  FilterOperator,
  FilterCondition,
  FilterGroup,
  SearchParams,
  SearchResult,
  FacetResult,
  TimeRange,
  AggregationParams,
  AggregationResult,
  CacheConfig,
  RateLimitConfig,
  AuditEntry,
  ModelEvent,
  WebhookPayload,
  BackgroundJob,
  MetricPoint,
  HealthCheck,
  ConfigValue,
  FeatureFlag,
  APIResponse
} from './utils';

// Utility functions from various modules
export {
  calculateClusterScore,
  calculateIntentMix,
  generateClusterLabel,
  getClusterRecommendations
} from './cluster';

export {
  getDefaultRunSettings,
  calculateRunProgress,
  estimateRemainingTime,
  getRunStatusColor,
  getStageDisplayName
} from './run';

export {
  getDefaultScoringWeights,
  calculateBlendedScore,
  batchScore,
  optimizeScoringWeights,
  getScoringTierColor,
  formatScoreAsPercentage,
  getScoreGrade
} from './scoring';

export {
  transformToEditorialRoadmapCSV,
  transformToKeywordUniverseCSV,
  transformToClusterAnalysisCSV,
  getExportFileExtension,
  getExportMimeType,
  generateExportFilename,
  calculateExportSize,
  formatExportValue,
  validateExportData
} from './export';

export {
  validateModel,
  batchValidate,
  assessDataQuality,
  formatValidationError,
  formatValidationWarning,
  getValidationSummary
} from './validation';

export {
  createPagination,
  buildCacheKey,
  parseTimeRange,
  generateId,
  slugify,
  formatBytes,
  formatNumber,
  debounce,
  throttle,
  retry,
  groupBy,
  chunk,
  unique,
  pick,
  omit,
  deepMerge,
  isEmptyValue,
  sanitizeHtml,
  validateEmail,
  validateUrl,
  parseJSON,
  safeStringify
} from './utils';

// Re-export database types for compatibility (avoiding conflicts)
export type {
  Database,
  KeywordStage,
  KeywordIntent,
  RunStatus,
  RoadmapStage
} from '../types/database';
export * from '../types/ahrefs';
export * from '../types/anthropic';
export * from '../types/api';

// Common utility types used across models
export type UUID = string;
export type Timestamp = string;
export type JSONValue = string | number | boolean | null | { [key: string]: JSONValue } | JSONValue[];

/**
 * Brand types for domain modeling and type safety
 */
export type KeywordString = string & { readonly __brand: 'keyword' };
export type DomainString = string & { readonly __brand: 'domain' };
export type URLString = string & { readonly __brand: 'url' };
export type EmailString = string & { readonly __brand: 'email' };

/**
 * Utility functions for branded types
 */
export const createKeyword = (value: string): KeywordString => {
  if (!value || value.trim().length === 0) {
    throw new Error('Keyword cannot be empty');
  }
  return value.trim().toLowerCase() as KeywordString;
};

export const createDomain = (value: string): DomainString => {
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
  if (!domainRegex.test(value)) {
    throw new Error('Invalid domain format');
  }
  return value.toLowerCase() as DomainString;
};

export const createURL = (value: string): URLString => {
  try {
    new URL(value);
    return value as URLString;
  } catch {
    throw new Error('Invalid URL format');
  }
};

export const createEmail = (value: string): EmailString => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(value)) {
    throw new Error('Invalid email format');
  }
  return value.toLowerCase() as EmailString;
};