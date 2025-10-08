import { Injectable, Logger } from '@nestjs/common';
import { CreateDemoResponseDto } from '../dto/demo-automation.dto';
import { BrowserService } from '../browser/browser.service';
import { AiService, FeatureTree } from '../ai/ai.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class DemoAutomationService {
  private readonly logger = new Logger(DemoAutomationService.name);

  constructor(
    private readonly browserService: BrowserService,
    private readonly aiService: AiService,
  ) {}

  async loginToWebsite(
    websiteUrl: string,
    credentials: { username: string; password: string },
  ): Promise<CreateDemoResponseDto> {
    const startTime = Date.now();
    const demoId = uuidv4();

    this.logger.log(`🚀 Starting feature extraction for: ${websiteUrl}`);

    try {
      // Use browser service to login and extract page
      const loginResult = await this.browserService.loginAndExtractPage(
        websiteUrl,
        credentials,
      );

      if (!loginResult.success) {
        this.logger.warn(
          '⚠️ Login may not have been successful, but continuing with feature extraction',
        );
      }

      // Extract features using AI
      this.logger.log('🤖 Starting AI feature extraction...');
      const featureTree = await this.aiService.extractFeatures(
        loginResult.html,
        loginResult.pageInfo,
      );

      const processingTime = Date.now() - startTime;

      this.logger.log(`✅ Feature extraction completed in ${processingTime}ms`);
      this.logger.log(`📊 Extracted ${featureTree.features.length} features`);

      return {
        demoId,
        demoName: 'AI-Powered Feature Extraction Demo',
        websiteUrl,
        loginStatus: loginResult.success ? 'success' : 'partial',
        pageInfo: loginResult.pageInfo,
        summary: {
          processingTime,
          loginAttempted: true,
          finalUrl: loginResult.finalUrl,
        },
        extractedFeatures: featureTree,
      };
    } catch (error) {
      this.logger.error(`❌ Feature extraction failed: ${error.message}`);
      throw new Error(`Feature extraction failed: ${error.message}`);
    }
  }
}
