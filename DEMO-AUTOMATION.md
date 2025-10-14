# Demo Automation System

A comprehensive demo automation system built with **LangGraphJS** + **Gemini** + **Puppeteer** that can automatically generate product tours by analyzing web pages and creating interactive demonstrations.

## 🎯 Overview

This system combines the power of:
- **LangGraphJS**: For orchestrating complex workflows with state management
- **Gemini AI**: For intelligent decision-making and reasoning
- **Puppeteer**: For browser automation and DOM manipulation

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Product Docs   │    │  Environment    │    │   Persistence  │
│      DB         │    │     / UI       │    │   / Memory     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                LangGraphJS Agent                               │
│     (Nodes & Edges, Memory, Retrieval + Reasoning)            │
└─────────────────────────────────────────────────────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐    ┌─────────────────┐
│  Gemini LLM     │    │ Puppeteer Worker │
│     API         │    │                 │
└─────────────────┘    └─────────────────┘
         │                       │
         └───────────┬─────────────┘
                     ▼
        Product Tour Builder → JSON output
```

## 🚀 Features

- **Intelligent Navigation**: AI-powered decision making for web interactions
- **Automatic Login**: Smart form detection and credential handling
- **Tour Generation**: Creates step-by-step product tours with screenshots
- **State Management**: Persistent memory across workflow steps
- **Error Handling**: Robust error recovery and validation
- **Screenshot Capture**: Visual documentation of each step
- **Flexible Configuration**: Customizable tour parameters and goals

## 📦 Installation

1. **Install Dependencies**:
```bash
npm install @langchain/langgraph @google/generative-ai @langchain/community --legacy-peer-deps
```

2. **Environment Setup**:
```bash
# Add to your .env file
GEMINI_API_KEY=your_gemini_api_key_here
```

3. **Build the Project**:
```bash
npm run build
```

## 🔧 Usage

### Basic Login Demo

```typescript
const result = await demoAutomationService.loginToWebsite(
  'https://example.com',
  { username: 'user@example.com', password: 'password123' }
);
```

### Generate Product Tour

```typescript
const tourConfig: TourConfig = {
  goal: 'Navigate to user dashboard and view profile settings',
  featureName: 'UserDashboard',
  maxSteps: 5,
  timeout: 30000,
  includeScreenshots: true
};

const featureDocs: ProductDocs = {
  featureName: 'UserDashboard',
  description: 'User dashboard with profile settings',
  steps: [
    'Click on user profile icon',
    'Navigate to settings page',
    'View profile information'
  ],
  selectors: {
    profileIcon: '.user-profile-icon',
    settingsLink: 'a[href*="settings"]'
  },
  expectedOutcomes: [
    'Successfully navigate to user dashboard',
    'Access profile settings'
  ]
};

const result = await demoAutomationService.generateProductTour(
  'https://example.com',
  { username: 'user@example.com', password: 'password123' },
  tourConfig,
  featureDocs
);
```

### API Endpoints

#### 1. Create Demo
```http
POST /demo/create-demo
Content-Type: application/json

{
  "websiteUrl": "https://example.com",
  "credentials": {
    "username": "user@example.com",
    "password": "password123"
  },
  "tourConfig": {
    "goal": "Navigate to dashboard",
    "featureName": "Dashboard",
    "maxSteps": 5,
    "timeout": 30000,
    "includeScreenshots": true
  },
  "featureDocs": {
    "featureName": "Dashboard",
    "description": "Main dashboard page",
    "steps": ["Navigate to dashboard"],
    "selectors": {},
    "expectedOutcomes": ["Successfully reach dashboard"]
  }
}
```

#### 2. Generate Tour
```http
POST /demo/generate-tour
Content-Type: application/json

{
  "websiteUrl": "https://example.com",
  "credentials": {
    "username": "user@example.com",
    "password": "password123"
  },
  "featureName": "UserProfile",
  "goal": "Update user profile information",
  "maxSteps": 8
}
```

#### 3. Stop Automation
```http
POST /demo/stop-automation
```

## 🧩 Components

### 1. GeminiService
- **Purpose**: AI reasoning and decision making
- **Features**: 
  - Analyzes DOM state and decides next actions
  - Generates tooltip text for UI elements
  - Validates action success
  - Provides reasoning for decisions

### 2. PuppeteerWorkerService
- **Purpose**: Browser automation and DOM manipulation
- **Features**:
  - Automatic login detection and execution
  - DOM state extraction
  - Screenshot capture
  - Element positioning
  - Action execution (click, type, hover, select)

### 3. LangGraphWorkflowService
- **Purpose**: Orchestrates the entire workflow
- **Features**:
  - State management across steps
  - Workflow orchestration
  - Error handling and recovery
  - Memory persistence

### 4. DemoAutomationService
- **Purpose**: Main service that coordinates everything
- **Features**:
  - High-level API for tour generation
  - Login automation
  - Result formatting
  - Cleanup management

## 🔄 Workflow Process

1. **Initialize**: Set up Puppeteer browser and navigate to website
2. **Login**: Automatically detect and fill login forms
3. **Analyze**: Use Gemini to analyze current page state
4. **Decide**: AI determines next action based on goal and context
5. **Execute**: Puppeteer performs the determined action
6. **Validate**: Verify action was successful
7. **Repeat**: Continue until goal is achieved or max steps reached
8. **Complete**: Generate final tour JSON with all steps

## 📊 Response Format

```typescript
interface DemoAutomationResult {
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

interface TourStep {
  order: number;
  action: Action;
  selector: string;
  description: string;
  tooltip: string;
  position?: { x: number; y: number };
  screenshot?: string;
  timestamp: number;
  success: boolean;
  errorMessage?: string;
}
```

## 🛠️ Configuration

### TourConfig
```typescript
interface TourConfig {
  goal: string;                    // What the tour should accomplish
  featureName: string;             // Name of the feature being toured
  maxSteps: number;                // Maximum number of steps
  timeout: number;                 // Timeout for actions
  includeScreenshots: boolean;     // Whether to capture screenshots
  targetSelectors?: string[];      // Specific selectors to target
  excludeSelectors?: string[];     // Selectors to avoid
}
```

### ProductDocs
```typescript
interface ProductDocs {
  featureName: string;             // Feature identifier
  description: string;             // Feature description
  steps: string[];                 // Expected workflow steps
  selectors: Record<string, string>; // CSS selectors for elements
  expectedOutcomes: string[];      // What should happen
  prerequisites?: string[];         // Required setup steps
}
```

## 🧪 Testing

Run the test script to see the system in action:

```bash
npm run build
node dist/demo-automation/test-demo-automation.js
```

## 🔍 Troubleshooting

### Common Issues

1. **Gemini API Key**: Ensure `GEMINI_API_KEY` is set in environment
2. **Puppeteer Issues**: Make sure Chrome/Chromium is installed
3. **Login Failures**: Check if login form selectors are correct
4. **Timeout Errors**: Increase timeout values for slow websites

### Debug Mode

Enable debug logging by setting:
```bash
DEBUG=demo-automation:*
```

## 🚀 Advanced Usage

### Custom Selectors
```typescript
const tourConfig: TourConfig = {
  goal: 'Complete checkout process',
  featureName: 'Checkout',
  maxSteps: 10,
  timeout: 30000,
  includeScreenshots: true,
  targetSelectors: [
    '.checkout-button',
    '#payment-form',
    '.confirm-order'
  ],
  excludeSelectors: [
    '.advertisement',
    '.popup-close'
  ]
};
```

### Custom Feature Documentation
```typescript
const featureDocs: ProductDocs = {
  featureName: 'EcommerceCheckout',
  description: 'Complete e-commerce checkout process',
  steps: [
    'Add item to cart',
    'Proceed to checkout',
    'Enter shipping information',
    'Select payment method',
    'Confirm order'
  ],
  selectors: {
    addToCart: '.add-to-cart-btn',
    checkout: '.checkout-btn',
    shippingForm: '#shipping-form',
    paymentMethod: '.payment-options',
    confirmOrder: '.confirm-order-btn'
  },
  expectedOutcomes: [
    'Item added to cart successfully',
    'Checkout page loaded',
    'Shipping form completed',
    'Payment method selected',
    'Order confirmed'
  ],
  prerequisites: [
    'User must be logged in',
    'Item must be in stock'
  ]
};
```

## 📈 Performance Considerations

- **Memory Usage**: Screenshots can be memory-intensive
- **API Costs**: Gemini API calls have costs per token
- **Timeout Settings**: Balance between speed and reliability
- **Concurrent Limits**: Avoid running multiple instances simultaneously

## 🔒 Security

- **Credentials**: Never log or store credentials in plain text
- **API Keys**: Use environment variables for sensitive data
- **Network**: Consider VPN for testing on restricted sites
- **Cleanup**: Always clean up browser instances

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

---

**Built with ❤️ using LangGraphJS, Gemini AI, and Puppeteer**