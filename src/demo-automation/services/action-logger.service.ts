import { Injectable } from '@nestjs/common';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface ActionRunResult {
  actionId: string;
  timestamp: number;
  action: {
    type: string;
    selector?: string;
    inputText?: string;
    description: string;
    expectedOutcome?: string;
    priority?: string;
    estimatedDuration?: number;
    prerequisites?: string[];
  };
  execution: {
    success: boolean;
    error?: string;
    duration: number;
    startTime: number;
    endTime: number;
  };
  fallback?: {
    used: boolean;
    fallbackAction?: {
      type: string;
      selector?: string;
      inputText?: string;
      description: string;
    };
    fallbackSuccess?: boolean;
    fallbackError?: string;
  };
  context: {
    currentUrl: string;
    pageTitle: string;
    domState?: any;
  };
  validation: {
    validated: boolean;
    validationSuccess?: boolean;
    validationReasoning?: string;
    criticalAction?: boolean;
  };
  metadata: {
    sessionId: string;
    workflowType: 'langgraph' | 'smart-agent';
    retryCount: number;
    maxRetries: number;
  };
}

@Injectable()
export class ActionLoggerService {
  private logFilePath: string;
  private sessionId: string;
  private actionRuns: ActionRunResult[] = [];

  constructor() {
    this.sessionId = `session-${Date.now()}`;
    this.logFilePath = join(process.cwd(), 'action-run.json');
  }

  /**
   * Log the start of an action execution
   */
  logActionStart(
    action: any,
    context: {
      currentUrl: string;
      pageTitle: string;
      domState?: any;
    },
    metadata: {
      workflowType: 'langgraph' | 'smart-agent';
      retryCount?: number;
      maxRetries?: number;
    }
  ): string {
    const actionId = `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const actionRun: ActionRunResult = {
      actionId,
      timestamp: Date.now(),
      action: {
        type: action.type,
        selector: action.selector,
        inputText: action.inputText,
        description: action.description,
        expectedOutcome: action.expectedOutcome,
        priority: action.priority,
        estimatedDuration: action.estimatedDuration,
        prerequisites: action.prerequisites
      },
      execution: {
        success: false,
        duration: 0,
        startTime: Date.now(),
        endTime: 0
      },
      fallback: {
        used: false
      },
      context: {
        currentUrl: context.currentUrl,
        pageTitle: context.pageTitle,
        domState: context.domState
      },
      validation: {
        validated: false
      },
      metadata: {
        sessionId: this.sessionId,
        workflowType: metadata.workflowType,
        retryCount: metadata.retryCount || 0,
        maxRetries: metadata.maxRetries || 3
      }
    };

    this.actionRuns.push(actionRun);
    this.saveToFile();
    
    console.log(`📝 Action logged: ${actionId} - ${action.type} - ${action.description}`);
    return actionId;
  }

  /**
   * Log the completion of an action execution
   */
  logActionComplete(
    actionId: string,
    success: boolean,
    error?: string
  ): void {
    const actionRun = this.actionRuns.find(run => run.actionId === actionId);
    if (!actionRun) {
      console.warn(`⚠️ Action ID not found: ${actionId}`);
      return;
    }

    const endTime = Date.now();
    actionRun.execution.success = success;
    actionRun.execution.error = error;
    actionRun.execution.duration = endTime - actionRun.execution.startTime;
    actionRun.execution.endTime = endTime;

    this.saveToFile();
    
    const status = success ? '✅' : '❌';
    console.log(`${status} Action completed: ${actionId} - Duration: ${actionRun.execution.duration}ms`);
  }

  /**
   * Log fallback action usage
   */
  logFallbackUsed(
    actionId: string,
    fallbackAction: any,
    fallbackSuccess: boolean,
    fallbackError?: string
  ): void {
    const actionRun = this.actionRuns.find(run => run.actionId === actionId);
    if (!actionRun) {
      console.warn(`⚠️ Action ID not found for fallback: ${actionId}`);
      return;
    }

    actionRun.fallback = {
      used: true,
      fallbackAction: {
        type: fallbackAction.type,
        selector: fallbackAction.selector,
        inputText: fallbackAction.inputText,
        description: fallbackAction.description
      },
      fallbackSuccess,
      fallbackError
    };

    this.saveToFile();
    console.log(`🔄 Fallback logged: ${actionId} - ${fallbackAction.type} - Success: ${fallbackSuccess}`);
  }

  /**
   * Log validation results
   */
  logValidation(
    actionId: string,
    validationSuccess: boolean,
    validationReasoning: string,
    criticalAction: boolean = false
  ): void {
    const actionRun = this.actionRuns.find(run => run.actionId === actionId);
    if (!actionRun) {
      console.warn(`⚠️ Action ID not found for validation: ${actionId}`);
      return;
    }

    actionRun.validation = {
      validated: true,
      validationSuccess,
      validationReasoning,
      criticalAction
    };

    this.saveToFile();
    console.log(`🔍 Validation logged: ${actionId} - Success: ${validationSuccess} - Critical: ${criticalAction}`);
  }

  /**
   * Update context information
   */
  updateContext(
    actionId: string,
    context: {
      currentUrl?: string;
      pageTitle?: string;
      domState?: any;
    }
  ): void {
    const actionRun = this.actionRuns.find(run => run.actionId === actionId);
    if (!actionRun) {
      console.warn(`⚠️ Action ID not found for context update: ${actionId}`);
      return;
    }

    if (context.currentUrl) actionRun.context.currentUrl = context.currentUrl;
    if (context.pageTitle) actionRun.context.pageTitle = context.pageTitle;
    if (context.domState) actionRun.context.domState = context.domState;

    this.saveToFile();
  }

  /**
   * Get all action runs for the current session
   */
  getAllActionRuns(): ActionRunResult[] {
    return this.actionRuns;
  }

  /**
   * Get action runs by status
   */
  getActionRunsByStatus(success: boolean): ActionRunResult[] {
    return this.actionRuns.filter(run => run.execution.success === success);
  }

  /**
   * Get action runs that used fallbacks
   */
  getActionRunsWithFallbacks(): ActionRunResult[] {
    return this.actionRuns.filter(run => run.fallback?.used === true);
  }

  /**
   * Get critical action failures
   */
  getCriticalActionFailures(): ActionRunResult[] {
    return this.actionRuns.filter(run => 
      run.validation.criticalAction === true && 
      run.execution.success === false
    );
  }

  /**
   * Get session statistics
   */
  getSessionStats(): {
    totalActions: number;
    successfulActions: number;
    failedActions: number;
    actionsWithFallbacks: number;
    criticalFailures: number;
    averageDuration: number;
    totalDuration: number;
  } {
    const totalActions = this.actionRuns.length;
    const successfulActions = this.actionRuns.filter(run => run.execution.success).length;
    const failedActions = totalActions - successfulActions;
    const actionsWithFallbacks = this.actionRuns.filter(run => run.fallback?.used).length;
    const criticalFailures = this.getCriticalActionFailures().length;
    
    const totalDuration = this.actionRuns.reduce((sum, run) => sum + run.execution.duration, 0);
    const averageDuration = totalActions > 0 ? totalDuration / totalActions : 0;

    return {
      totalActions,
      successfulActions,
      failedActions,
      actionsWithFallbacks,
      criticalFailures,
      averageDuration,
      totalDuration
    };
  }

  /**
   * Save action runs to JSON file
   */
  private saveToFile(): void {
    try {
      const logData = {
        sessionId: this.sessionId,
        timestamp: Date.now(),
        totalActions: this.actionRuns.length,
        statistics: this.getSessionStats(),
        actionRuns: this.actionRuns
      };

      writeFileSync(this.logFilePath, JSON.stringify(logData, null, 2));
    } catch (error) {
      console.error('❌ Failed to save action log:', error);
    }
  }

  /**
   * Load existing action runs from file
   */
  loadFromFile(): void {
    if (existsSync(this.logFilePath)) {
      try {
        const data = JSON.parse(readFileSync(this.logFilePath, 'utf8'));
        this.actionRuns = data.actionRuns || [];
        console.log(`📂 Loaded ${this.actionRuns.length} existing action runs`);
      } catch (error) {
        console.warn('⚠️ Failed to load existing action runs:', error);
        this.actionRuns = [];
      }
    }
  }

  /**
   * Clear all action runs and start fresh
   */
  clearLogs(): void {
    this.actionRuns = [];
    this.sessionId = `session-${Date.now()}`;
    this.saveToFile();
    console.log('🗑️ Action logs cleared');
  }

  /**
   * Export action runs to a specific file
   */
  exportToFile(filePath: string): void {
    try {
      const logData = {
        sessionId: this.sessionId,
        timestamp: Date.now(),
        totalActions: this.actionRuns.length,
        statistics: this.getSessionStats(),
        actionRuns: this.actionRuns
      };

      writeFileSync(filePath, JSON.stringify(logData, null, 2));
      console.log(`📤 Action runs exported to: ${filePath}`);
    } catch (error) {
      console.error('❌ Failed to export action runs:', error);
    }
  }
}
