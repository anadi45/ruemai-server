export interface Action {
  type: 'click' | 'type' | 'hover' | 'select' | 'navigate' | 'wait' | 'scroll' | 'extract' | 'evaluate' | 'click_coordinates' | 'hover_coordinates' | 'type_coordinates' | 'scroll_coordinates' | 'select_coordinates';
  selector?: string;
  inputText?: string;
  description: string;
  position?: {
    x: number;
    y: number;
  };
  coordinates?: {
    x: number;
    y: number;
    confidence: number;
    reasoning: string;
  };
  metadata?: Record<string, any>;
}

export interface DOMState {
  domHtml: string;
  visibleText: string[];
  clickableSelectors: string[];
  inputSelectors: string[];
  selectSelectors: string[];
  currentUrl: string;
  pageTitle: string;
  timestamp: number;
}

export interface DOMAnalysis {
  urlChanged: boolean;
  titleChanged: boolean;
  newElements: string[];
  removedElements: string[];
  newClickableElements: string[];
  newInputElements: string[];
  pageLoadComplete: boolean;
  hasErrors: boolean;
  errorMessages: string[];
  newContent: string[];
  actionImpact: string;
  nextActionRecommendations: string[];
}

export interface ElementMatch {
  selector: string;
  confidence: number;
  reasoning: string;
  elementType: 'button' | 'input' | 'link' | 'dropdown' | 'text' | 'container' | 'coordinates';
  textContent?: string;
  attributes?: Record<string, string>;
  position?: { x: number; y: number };
  isVisible: boolean;
  isClickable: boolean;
}

export interface IntelligentElementDiscovery {
  targetDescription: string;
  foundElements: ElementMatch[];
  bestMatch: ElementMatch | null;
  searchStrategy: 'text_match' | 'attribute_match' | 'semantic_match' | 'fallback' | 'screenshot-analysis' | 'screenshot-fallback' | 'coordinate-detection' | 'coordinate-discovery';
  searchContext: string;
  recommendations: string[];
}

export interface CoordinateDiscovery {
  targetDescription: string;
  coordinates: Array<{
    x: number;
    y: number;
    confidence: number;
    reasoning: string;
    elementDescription: string;
  }>;
  pageAnalysis: string;
  searchStrategy: 'coordinate-detection' | 'coordinate-fallback';
  searchContext: string;
  recommendations: string[];
  bestMatch: {
    x: number;
    y: number;
    confidence: number;
    reasoning: string;
    elementDescription: string;
  } | null;
}

export interface TourStep {
  order: number;
  action: Action;
  selector: string;
  description: string;
  tooltip: string;
  position?: {
    x: number;
    y: number;
  };
  timestamp: number;
  success: boolean;
  errorMessage?: string;
}

export interface TourConfig {
  goal: string;
  featureName: string;
  maxSteps: number;
  timeout: number;
  includeScreenshots: boolean;
  targetSelectors?: string[];
  excludeSelectors?: string[];
}

export interface DemoAutomationState {
  currentStep: number;
  totalSteps: number;
  history: Action[];
  domState: DOMState;
  tourSteps: TourStep[];
  goal: string;
  featureDocs: string;
  isComplete: boolean;
  error?: string;
  startTime: number;
  endTime?: number;
}

export interface GeminiResponse {
  action: Action | null;
  reasoning: string;
  confidence: number;
  nextSteps?: string[];
}

export interface PuppeteerWorkerConfig {
  headless: boolean;
  viewport: {
    width: number;
    height: number;
  };
  userAgent?: string;
  timeout: number;
  waitForSelectorTimeout: number;
}

export interface ProductDocs {
  featureName: string;
  description: string;
  steps: string[];
  selectors: Record<string, string>;
  expectedOutcomes: string[];
  prerequisites?: string[];
}

export interface PuppeteerAction {
  type: 'click' | 'type' | 'hover' | 'select' | 'navigate' | 'wait' | 'scroll' | 'extract' | 'evaluate' | 'click_coordinates' | 'hover_coordinates' | 'type_coordinates' | 'scroll_coordinates' | 'select_coordinates';
  selector?: string;
  fallbackAction?: PuppeteerAction; // Alternative action (different type)
  inputText?: string;
  description: string;
  expectedOutcome: string;
  waitCondition?: string;
  extractData?: string;
  errorHandling?: string;
  priority: 'high' | 'medium' | 'low';
  estimatedDuration: number; // in seconds
  prerequisites?: string[];
  coordinates?: {
    x: number;
    y: number;
    confidence: number;
    reasoning: string;
  };
}

export interface ActionPlan {
  featureName: string;
  totalActions: number;
  estimatedDuration: number; // total in seconds
  scrapingStrategy?: string;
  actions: PuppeteerAction[];
  summary: {
    clickActions: number;
    typeActions: number;
    navigationActions: number;
    waitActions: number;
    extractActions: number;
    evaluateActions: number;
  };
}

export interface SmartAgentState {
  currentActionIndex: number;
  actionPlan: ActionPlan;
  domState?: DOMState;
  domAnalysis?: DOMAnalysis;
  completedActions: number[];
  failedActions: number[];
  retryCount: number;
  maxRetries: number;
  tourSteps: TourStep[];
  extractedData: Record<string, any>;
  featureDocs: ProductDocs;
  goal: string;
  currentContext: string;
  reasoning: string;
  isComplete: boolean;
  success: boolean;
  error?: string;
  startTime: number;
  endTime?: number;
  // Additional properties for compatibility
  currentStep?: number;
  totalSteps?: number;
  history?: Action[];
  adaptationStrategy?: 'strict' | 'flexible' | 'adaptive';
}

export interface DemoAutomationResult {
  success: boolean;
  tourSteps: TourStep[];
  totalSteps: number;
  processingTime: number;
  finalUrl: string;
  error?: string;
  summary: {
    featuresCovered: string[];
    actionsPerformed: string[];
    successRate: number;
  };
}
