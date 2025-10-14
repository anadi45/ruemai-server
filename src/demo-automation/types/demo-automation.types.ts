export interface Action {
  type: 'click' | 'type' | 'hover' | 'select' | 'navigate' | 'wait';
  selector?: string;
  inputText?: string;
  description: string;
  position?: {
    x: number;
    y: number;
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
  screenshot?: string; // base64 encoded
  timestamp: number;
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
  screenshot?: string;
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
  screenshots?: Array<{
    data: Buffer;
    description: string;
    stepReference?: string;
  }>;
}

export interface PuppeteerAction {
  type: 'click' | 'type' | 'hover' | 'select' | 'navigate' | 'wait' | 'scroll' | 'screenshot';
  selector?: string;
  inputText?: string;
  description: string;
  expectedOutcome: string;
  priority: 'high' | 'medium' | 'low';
  estimatedDuration: number; // in seconds
  prerequisites?: string[];
}

export interface ActionPlan {
  featureName: string;
  totalActions: number;
  estimatedDuration: number; // total in seconds
  actions: PuppeteerAction[];
  summary: {
    clickActions: number;
    typeActions: number;
    navigationActions: number;
    waitActions: number;
    screenshotActions: number;
  };
}

export interface DemoAutomationResult {
  success: boolean;
  tourSteps: TourStep[];
  totalSteps: number;
  processingTime: number;
  finalUrl: string;
  error?: string;
  screenshots?: string[];
  summary: {
    featuresCovered: string[];
    actionsPerformed: string[];
    successRate: number;
  };
}
