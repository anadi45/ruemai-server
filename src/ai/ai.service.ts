import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';

export interface Feature {
  name: string;
  description: string;
  actions: string[];
  selector?: string;
  category: string;
  importance: 'high' | 'medium' | 'low';
}

export interface FeatureTree {
  features: Feature[];
  navigation: {
    menus: string[];
    buttons: string[];
    forms: string[];
  };
  pageStructure: {
    sections: string[];
    interactiveElements: number;
  };
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private llm: ChatOpenAI;

  constructor(private configService: ConfigService) {
    this.llm = new ChatOpenAI({
      modelName: 'gpt-4o',
      temperature: 0.1,
      openAIApiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async extractFeatures(html: string, pageInfo: any): Promise<FeatureTree> {
    this.logger.log('🤖 Starting AI feature extraction...');

    try {
      const prompt = this.buildFeatureExtractionPrompt(html, pageInfo);
      const response = await this.llm.invoke(prompt);

      const extractedFeatures = this.parseFeatureResponse(
        response.content as string,
      );

      this.logger.log(
        `✅ Extracted ${extractedFeatures.features.length} features`,
      );

      return extractedFeatures;
    } catch (error) {
      this.logger.error(`❌ Feature extraction failed: ${error.message}`);
      throw new Error(`AI feature extraction failed: ${error.message}`);
    }
  }

  private buildFeatureExtractionPrompt(html: string, pageInfo: any): string {
    return `
Analyze this web application and extract all discoverable features. Focus on user-facing functionality that would be valuable for a product demo.

HTML Content (first 2000 chars):
${html.substring(0, 2000)}

Page Information:
- Title: ${pageInfo.title}
- URL: ${pageInfo.url}
- Total Elements: ${pageInfo.totalElements}
- Buttons: ${pageInfo.buttons}
- Links: ${pageInfo.links}
- Inputs: ${pageInfo.inputs}

Please analyze the page and return a JSON response with the following structure:

{
  "features": [
    {
      "name": "Feature Name",
      "description": "What this feature does",
      "actions": ["action1", "action2"],
      "selector": "CSS selector if identifiable",
      "category": "navigation|forms|data|settings|reports|etc",
      "importance": "high|medium|low"
    }
  ],
  "navigation": {
    "menus": ["menu1", "menu2"],
    "buttons": ["button1", "button2"],
    "forms": ["form1", "form2"]
  },
  "pageStructure": {
    "sections": ["section1", "section2"],
    "interactiveElements": number
  }
}

Focus on:
1. Navigation menus and main sections
2. Forms and input fields
3. Data tables and lists
4. Action buttons and controls
5. Settings and configuration areas
6. Reports and analytics sections
7. User management features
8. Search and filtering capabilities

Return only valid JSON, no additional text.
`;
  }

  private parseFeatureResponse(response: string): FeatureTree {
    try {
      // Clean the response to extract JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate and structure the response
      return {
        features: parsed.features || [],
        navigation: parsed.navigation || { menus: [], buttons: [], forms: [] },
        pageStructure: parsed.pageStructure || {
          sections: [],
          interactiveElements: 0,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to parse AI response: ${error.message}`);

      // Return fallback structure
      return {
        features: [
          {
            name: 'Page Analysis',
            description: 'Basic page analysis completed',
            actions: ['view', 'navigate'],
            category: 'general',
            importance: 'medium',
          },
        ],
        navigation: {
          menus: [],
          buttons: [],
          forms: [],
        },
        pageStructure: {
          sections: [],
          interactiveElements: 0,
        },
      };
    }
  }

  async generateFeatureDescription(
    feature: Feature,
    pageContext: string,
  ): Promise<string> {
    try {
      const prompt = `
Generate a clear, concise description for this feature that would be useful in a product demo:

Feature: ${feature.name}
Current Description: ${feature.description}
Actions: ${feature.actions.join(', ')}
Category: ${feature.category}
Page Context: ${pageContext}

Provide a 1-2 sentence description that explains what this feature does and why it's valuable to users.
`;

      const response = await this.llm.invoke(prompt);
      return response.content as string;
    } catch (error) {
      this.logger.error(
        `Failed to generate feature description: ${error.message}`,
      );
      return feature.description;
    }
  }
}
