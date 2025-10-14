import { writeFileSync } from 'fs';
import { join } from 'path';
import { ActionPlan } from '../types/demo-automation.types';

/**
 * Simple function to write LLM-generated plan to JSON file
 */
export function writePlanToFile(plan: ActionPlan, filePath?: string): void {
  const defaultPath = join(process.cwd(), 'puppeteer-plan.json');
  const targetPath = filePath || defaultPath;
  
  try {
    writeFileSync(targetPath, JSON.stringify(plan, null, 2));
    console.log(`✅ Plan written to ${targetPath}`);
  } catch (error) {
    console.error('❌ Failed to write plan:', error);
    throw error;
  }
}
