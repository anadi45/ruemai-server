import { Controller, Post, Body, UseInterceptors, UploadedFiles, Req, Get, Query } from '@nestjs/common';
import { FilesInterceptor, AnyFilesInterceptor } from '@nestjs/platform-express';
import { DemoAutomationService } from './demo-automation.service';
import { IntelligentScrapingService } from './services/intelligent-scraping.service';
import { CreateDemoResponseDto, CreateDemoWithFileRequestDto } from './demo-automation.dto';

@Controller('demo')
export class DemoAutomationController {
  constructor(
    private readonly demoAutomationService: DemoAutomationService,
    private readonly intelligentScrapingService: IntelligentScrapingService
  ) {}

  @Post('create-demo')
  @UseInterceptors(FilesInterceptor('featureDocs', 10)) // Allow up to 10 files
  async createDemo(
    @Body() body: CreateDemoWithFileRequestDto,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<any> {
    try {
      // Validate credentials
      if (!body.username || !body.password) {
        throw new Error('Invalid credentials: username and password are required');
      }

      if (body.username === 'undefined' || body.password === 'undefined') {
        throw new Error('Invalid credentials: username and password cannot be undefined');
      }
      
      if (!files || files.length === 0) {
        throw new Error('No files received. Please ensure you are sending files with the field name "featureDocs" and using multipart/form-data content type.');
      }
      
      // Create credentials object from the request body
      const credentials = {
        username: body.username,
        password: body.password
      };
      
      console.log(`\n🚀 Starting complete demo automation workflow...`);
      console.log(`📁 Processing ${files.length} document(s)`);
      console.log(`🌐 Target website: ${body.websiteUrl}`);
      console.log(`🎯 Feature: ${body.featureName || 'Auto-detected'}`);
      
      // Generate tour from uploaded documents (includes action planning and console logging)
      const result = await this.demoAutomationService.generateProductTourFromFiles(
        body.websiteUrl,
        credentials,
        files,
        body.featureName
      );
      
      console.log(`\n✅ Demo automation completed successfully!`);
      console.log(`📊 Demo ID: ${result.demoId}`);
      console.log(`📝 Demo Name: ${result.demoName}`);
      console.log(`🔗 Final URL: ${result.summary?.finalUrl}`);
      
      // Return comprehensive result including tour steps and metadata
      return {
        demoId: result.demoId,
        demoName: result.demoName,
        websiteUrl: result.websiteUrl,
        loginStatus: result.loginStatus,
        tourSteps: result.scrapedData?.pages?.[0]?.scrapedData || [],
        summary: result.summary,
        pageInfo: result.pageInfo
      };
    } catch (error) {
      throw error;
    }
  }



  @Post('stop-automation')
  async stopAutomation(): Promise<{ message: string }> {
    try {
      await this.demoAutomationService.stopAllAutomation();
      return { message: 'All automation stopped successfully' };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Demonstrate intelligent element discovery
   * This endpoint shows how the AI correlates plan actions with actual DOM elements
   */
  @Post('intelligent-discovery')
  async demonstrateIntelligentDiscovery(
    @Body() body: {
      actionDescription: string;
      actionType: string;
      context?: string;
    }
  ): Promise<{
    discovery: any;
    demonstration: string;
    success: boolean;
  }> {
    try {
      console.log('🔍 Demonstrating intelligent element discovery...');
      console.log(`📝 Action: "${body.actionDescription}"`);
      console.log(`🎯 Type: ${body.actionType}`);

      const result = await this.intelligentScrapingService.demonstrateElementDiscovery(
        body.actionDescription,
        body.actionType,
        body.context
      );

      return {
        discovery: result.discovery,
        demonstration: result.demonstration,
        success: true
      };
    } catch (error) {
      console.error('Intelligent discovery demonstration failed:', error);
      return {
        discovery: null,
        demonstration: `❌ Discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        success: false
      };
    }
  }

  /**
   * Create an intelligent action plan from high-level descriptions
   * This shows how the system converts human instructions into executable plans
   */
  @Post('create-intelligent-plan')
  async createIntelligentPlan(
    @Body() body: {
      featureName: string;
      highLevelSteps: string[];
      targetUrl: string;
    }
  ): Promise<{
    actionPlan: any;
    success: boolean;
    message: string;
  }> {
    try {
      console.log('🧠 Creating intelligent action plan...');
      console.log(`📋 Feature: ${body.featureName}`);
      console.log(`📝 Steps: ${body.highLevelSteps.length}`);

      const actionPlan = await this.intelligentScrapingService.createIntelligentActionPlan(
        body.featureName,
        body.highLevelSteps,
        body.targetUrl
      );

      return {
        actionPlan,
        success: true,
        message: `Intelligent action plan created with ${actionPlan.totalActions} actions`
      };
    } catch (error) {
      console.error('Failed to create intelligent plan:', error);
      return {
        actionPlan: null,
        success: false,
        message: `Failed to create plan: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Execute intelligent scraping with plan correlation
   * This is the main endpoint that demonstrates the intelligent scraping workflow
   */
  @Post('intelligent-scraping')
  async executeIntelligentScraping(
    @Body() body: {
      actionPlan: any;
      tourConfig: any;
      featureDocs: any;
      credentials?: { username: string; password: string };
    }
  ): Promise<{
    result: any;
    success: boolean;
    message: string;
  }> {
    try {
      console.log('🧠 Starting intelligent scraping...');
      console.log(`📋 Plan: ${body.actionPlan.featureName}`);
      console.log(`🎯 Goal: ${body.tourConfig.goal}`);

      const result = await this.intelligentScrapingService.executeIntelligentScraping(
        body.actionPlan,
        body.tourConfig,
        body.featureDocs,
        body.credentials
      );

      return {
        result,
        success: result.success,
        message: `Intelligent scraping completed with ${result.totalSteps} steps`
      };
    } catch (error) {
      console.error('Intelligent scraping failed:', error);
      return {
        result: null,
        success: false,
        message: `Scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Analyze scraping effectiveness
   */
  @Post('analyze-effectiveness')
  async analyzeEffectiveness(
    @Body() body: {
      result: any;
      originalPlan: any;
    }
  ): Promise<{
    analysis: any;
    success: boolean;
  }> {
    try {
      const analysis = await this.intelligentScrapingService.analyzeScrapingEffectiveness(
        body.result,
        body.originalPlan
      );

      return {
        analysis,
        success: true
      };
    } catch (error) {
      console.error('Effectiveness analysis failed:', error);
      return {
        analysis: null,
        success: false
      };
    }
  }
}
