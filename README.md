# 🚀 Documentation Crawler & Feature Extractor + Demo Automation

A powerful NestJS-based system for extracting product features from documentation and websites using AI-powered analysis, plus automated demo generation with browser automation.

<p align="center">
  <img src="https://nestjs.com/img/logo-small.svg" width="200" alt="NestJS Logo" />
</p>

## ✨ Features

### 📄 Document & Website Analysis
- **📄 Multi-format Document Support**: PDF, DOCX, TXT, MD, HTML
- **🕷️ Intelligent Web Crawling**: Extract content from websites with smart crawling
- **🤖 AI-Powered Extraction**: Uses OpenAI GPT-4 for intelligent feature extraction
- **💾 In-Memory Storage**: No database required for POC
- **📊 Chunked Processing**: Handles large documents with intelligent chunking
- **🔗 RESTful API**: Clean API endpoints for all operations
- **⚡ Real-time Processing**: Fast extraction with comprehensive statistics

### 🎬 Demo Automation (NEW!)
- **🌐 Browser Automation**: Automated website navigation using Puppeteer
- **🔐 Auto-Login**: Intelligent form detection and credential filling
- **🔍 UI Exploration**: Smart discovery of interactive elements
- **🤖 AI-Powered WIS Generation**: Creates Web Interaction Scripts using AI analysis
- **💾 File Storage**: Saves WIS scripts to `logs/demo/` directory
- **📊 Comprehensive Logging**: Detailed progress tracking and error handling
- **🛡️ Fallback Logic**: Robust error recovery and basic script generation

### 🤖 Fully Automated Process (NEW!)
- **🚀 Zero User Interaction**: Completely automated feature extraction and WIS generation
- **🔐 Auto-Login**: Automatically logs into applications with provided credentials
- **🧠 AI-Powered Analysis**: Uses LLM to extract features from any web application
- **🎬 Auto WIS Generation**: Creates interactive demo scripts for all discovered features
- **💾 File Storage**: Automatically saves WIS scripts to disk for immediate use

## 🏗️ Architecture

### 📄 Document & Website Analysis
```
Upload Docs → In-Memory Storage → Parser → Chunker → LLM → JSON Response
     ↓
Web Crawler → Content Extraction → Chunker → LLM → JSON Response
```

### 🎬 Demo Automation
```
Website URL + Credentials → Browser Automation → UI Exploration → AI Analysis → WIS Scripts → File Storage
```

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+** - [Download here](https://nodejs.org/)
- **OpenAI API Key** - [Get your key here](https://platform.openai.com/api-keys)
- **npm or yarn** package manager

### 1. Clone and Install

```bash
# Clone the repository
git clone <your-repo-url>
cd ruemai-server

# Install backend dependencies
npm install
```

### 2. Environment Setup

```bash
# Copy environment template
cp env.example .env

# Edit .env file and add your OpenAI API key
OPENAI_API_KEY=your_openai_api_key_here
```

**⚠️ Important**: The application will validate your configuration on startup and will fail to start if:
- OpenAI API key is missing or invalid
- Configuration values are out of acceptable ranges
- Required environment variables are not set

### 3. Start the Backend

```bash
# Development mode with hot reload
npm run start:dev

# Production mode
npm run start:prod
```

The backend server will start on `http://localhost:3000` 🎉

### 4. Test the Automated Process

```bash
# Test automated demo creation
node test-automated-demo.js

# Or use curl
curl -X POST http://localhost:3000/demo/create-automated-demo
```

The system will automatically:
- 🚀 Launch Puppeteer and navigate to your application
- 🔐 Login with demo credentials
- 🧠 Extract features using LLM
- 🤖 Generate WIS scripts for all features
- 💾 Save results to `logs/demo/` directory

## 📡 API Endpoints

### 📄 Document & Website Analysis
```http
POST /extract
Content-Type: multipart/form-data

# Form data:
- files: File[] (optional) - Upload documents
- url: string (optional) - Website URL to crawl (crawls entire website)
```


### 🤖 Automated Application Demo (NEW!)
```http
POST /demo/create-automated-demo
Content-Type: application/json

# No request body needed - completely automated process
# This endpoint will:
# 1. 🚀 Launch Puppeteer and navigate to your application
# 2. 🔐 Automatically login with demo credentials  
# 3. 🧠 Extract features using LLM from the application
# 4. 🔍 Explore UI elements with Puppeteer
# 5. 🤖 Generate WIS scripts for all extracted features
# 6. 💾 Save WIS scripts to logs/demo/ directory
```

## 🧪 Testing

### Manual Testing Examples

**1. Test Document Upload:**
```bash
curl -X POST http://localhost:3000/extract \
  -F "files=@document.pdf" \
  -F "files=@manual.docx"
```

**2. Test Website Crawling:**
```bash
curl -X POST http://localhost:3000/extract \
  -F "url=https://example.com"
```

**3. Test Combined Extraction:**
```bash
curl -X POST http://localhost:3000/extract \
  -F "files=@document.pdf" \
  -F "url=https://example.com"
```


**5. Test Automated Application Demo (NEW!):**
```bash
# This will automatically work with your local application
curl -X POST http://localhost:3000/demo/create-automated-demo \
  -H "Content-Type: application/json"

# Or use the test script
node test-automated-demo.js
```

### Unit Tests

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run e2e tests
npm run test:e2e

# Generate coverage report
npm run test:cov
```

## 📊 Sample Responses

### 📄 Document/Website Analysis Response
```json
{
  "features": [
    {
      "name": "Real-time Collaboration",
      "description": "Multiple users can edit documents simultaneously with live cursor tracking and instant updates.",
      "source": "https://example.com/features",
      "category": "Collaboration",
      "confidence": 0.95
    },
    {
      "name": "API Rate Limiting",
      "description": "Built-in rate limiting protects APIs from abuse with configurable limits per user or IP address.",
      "source": "docs/api-guide.pdf",
      "category": "Security",
      "confidence": 0.88
    }
  ],
  "stats": {
    "documentsProcessed": 3,
    "pagesCrawled": 15,
    "featuresFound": 47,
    "processingTime": "23.4s"
  }
}
```

### 🎬 Demo Automation Response (NEW!)
```json
{
  "demoId": "uuid-generated-id",
  "demoName": "Demo for example.com",
  "websiteUrl": "https://example.com",
  "generatedScripts": [
    {
      "name": "Application Navigation",
      "description": "Navigate through the main sections of the application",
      "category": "Navigation",
      "steps": [
        {
          "selector": "#nav-link-1",
          "action": "click",
          "tooltip": {
            "text": "Click to navigate to next section",
            "position": "bottom"
          }
        }
      ]
    }
  ],
  "summary": {
    "totalFlows": 3,
    "totalSteps": 8,
    "processingTime": 15000
  },
  "filePaths": {
    "demoFolder": "D:\\ruemai-server\\logs\\demo\\uuid-generated-id",
    "wisFiles": [
      "D:\\ruemai-server\\logs\\demo\\uuid-generated-id\\1-application-navigation.json"
    ],
    "metadataFile": "D:\\ruemai-server\\logs\\demo\\uuid-generated-id\\metadata.json"
  }
}
```

## 🔧 Configuration

### Environment Variables

```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Application Configuration
PORT=3000
NODE_ENV=development

# Crawler Configuration
MAX_FILE_SIZE=10485760  # 10MB
CHUNK_SIZE=4000

# Rate Limiting & Concurrency
CRAWL_DELAY=1000  # milliseconds between batches
```

### Supported File Types

- **PDF**: `application/pdf`
- **Word Documents**: `.docx`, `.doc`
- **Text Files**: `.txt`
- **Markdown**: `.md`
- **HTML**: `.html`

## 🏗️ Project Structure

```
src/
├── extraction/          # Main extraction service
├── upload/              # File upload handling
├── parser/              # Document parsing
├── web-crawler/         # Website crawling
├── demo-automation/     # Demo automation service (NEW!)
├── llm/                 # LLM integration
├── types/               # TypeScript interfaces
├── utils/               # Storage utilities
├── filters/             # Error handling
└── dto/                 # Data transfer objects

logs/
├── debug/              # Debug logs
└── demo/               # Demo WIS scripts (NEW!)
    └── {demoId}/
        ├── metadata.json
        ├── 1-application-navigation.json
        └── 2-data-entry-flow.json
```

## 🚨 Troubleshooting

### Common Issues

**1. OpenAI API Key Error:**
```bash
# Make sure your API key is set in .env
echo "OPENAI_API_KEY=your_key_here" > .env
```

**2. File Upload Issues:**
- Check file size limits (default: 10MB)
- Ensure file types are supported
- Verify multipart/form-data encoding

**3. Crawling Issues:**
- Some websites block automated requests
- Check network connectivity
- Verify URL format

**4. Demo Automation Issues:**
- Browser may fail to launch (check Puppeteer installation)
- Login forms may not be detected (check website structure)
- WIS generation may fail (check OpenAI API key)
- Files not saved (check `logs/demo/` directory permissions)

### Performance Tips

- **For Speed**: Use `gpt-4o` for fast and accurate results
- **For Accuracy**: Use `gpt-4o` for high-quality extraction
- **For Cost**: Limit document/page count and use smaller chunks
- **Demo Automation**: Set `headless: true` for production (faster browser automation)
- **File Storage**: Check `logs/demo/` directory for generated WIS scripts

## 🎬 Demo Automation Details

### What is Demo Automation?
Demo automation automatically generates **Web Interaction Scripts (WIS)** that can be used to create interactive product demos and guided tours for any web application.

### How It Works
1. **🌐 Website Navigation**: Puppeteer navigates to your website
2. **🔐 Auto-Login**: Intelligently detects and fills login forms
3. **🔍 UI Exploration**: Discovers interactive elements (buttons, links, inputs)
4. **🤖 AI Analysis**: Uses LLM to understand UI patterns and user flows
5. **📝 WIS Generation**: Creates structured interaction scripts
6. **💾 File Storage**: Saves scripts to `logs/demo/{demoId}/`

### Generated WIS Scripts
Each WIS script contains:
- **Step-by-step instructions** for user interactions
- **CSS selectors** for UI elements
- **Tooltip content** for guided tours
- **Action sequences** (click, type, hover, etc.)

### Use Cases
- **Product Onboarding**: Create guided tours for new users
- **Feature Demos**: Showcase specific functionality
- **Training Materials**: Interactive tutorials
- **Chrome Extension Integration**: Playback WIS scripts in browsers

### File Structure
```
logs/demo/{demoId}/
├── metadata.json              # Demo overview and statistics
├── 1-application-navigation.json  # Navigation flow script
├── 2-data-entry-flow.json     # Form interaction script
└── 3-action-flow.json         # Button/action script
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [NestJS](https://nestjs.com/) - The amazing Node.js framework
- [OpenAI](https://platform.openai.com/) - For the powerful AI models
- [pdf-parse](https://github.com/modesty/pdf-parse) - PDF parsing library
- [Cheerio](https://cheerio.js.org/) - Server-side HTML parsing
- [Puppeteer](https://pptr.dev/) - Browser automation for demo generation
- [UUID](https://www.npmjs.com/package/uuid) - Unique identifier generation
