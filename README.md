# 🚀 Documentation Crawler & Feature Extractor

A powerful NestJS-based system for extracting product features from documentation and websites using AI-powered analysis.

<p align="center">
  <img src="https://nestjs.com/img/logo-small.svg" width="200" alt="NestJS Logo" />
</p>

## ✨ Features

- **📄 Multi-format Document Support**: PDF, DOCX, TXT, MD, HTML
- **🕷️ Intelligent Web Crawling**: Extract content from websites with smart crawling
- **🤖 AI-Powered Extraction**: Uses OpenAI GPT-4 for intelligent feature extraction
- **💾 In-Memory Storage**: No database required for POC
- **📊 Chunked Processing**: Handles large documents with intelligent chunking
- **🔗 RESTful API**: Clean API endpoints for all operations
- **⚡ Real-time Processing**: Fast extraction with comprehensive statistics

## 🏗️ Architecture

```
Upload Docs → In-Memory Storage → Parser → Chunker → LLM → JSON Response
     ↓
Web Crawler → Content Extraction → Chunker → LLM → JSON Response
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

# Install dependencies
npm install
```

### 2. Environment Setup

```bash
# Copy environment template
cp env.example .env

# Edit .env file and add your OpenAI API key
OPENAI_API_KEY=your_openai_api_key_here
```

### 3. Start the Application

```bash
# Development mode with hot reload
npm run start:dev

# Production mode
npm run start:prod
```

The server will start on `http://localhost:3000` 🎉

## 📡 API Endpoints

### Main Extraction Endpoint
```http
POST /extract
Content-Type: multipart/form-data

# Form data:
- files: File[] (optional) - Upload documents
- url: string (optional) - Website URL to crawl
- maxPages: number (optional) - Max pages to crawl (default: 50)
```

### Document-Only Extraction
```http
POST /extract/documents
Content-Type: multipart/form-data

# Form data:
- files: File[] - Documents to process
```

### Website-Only Extraction
```http
POST /extract/website
Content-Type: application/json

{
  "url": "https://example.com",
  "maxPages": 25
}
```

### Get All Features
```http
GET /extract/features
```

### Get Statistics
```http
GET /extract/stats
```

### Clear Storage
```http
DELETE /extract/clear
```

## 🧪 Testing

### Manual Testing Examples

**1. Test Document Upload:**
```bash
curl -X POST http://localhost:3000/extract/documents \
  -F "files=@document.pdf" \
  -F "files=@manual.docx"
```

**2. Test Website Crawling:**
```bash
curl -X POST http://localhost:3000/extract/website \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "maxPages": 10}'
```

**3. Test Combined Extraction:**
```bash
curl -X POST http://localhost:3000/extract \
  -F "files=@document.pdf" \
  -F "url=https://example.com" \
  -F "maxPages=25"
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

## 📊 Sample Response

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

## 🔧 Configuration

### Environment Variables

```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Application Configuration
PORT=3000
NODE_ENV=development

# Crawler Configuration
MAX_CRAWL_PAGES=50
MAX_FILE_SIZE=10485760  # 10MB
CHUNK_SIZE=4000

# Rate Limiting
CRAWL_DELAY=1000  # milliseconds between requests
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
├── extractor/           # LLM integration
├── types/               # TypeScript interfaces
├── utils/               # Storage utilities
├── filters/             # Error handling
└── dto/                 # Data transfer objects
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

### Performance Tips

- **For Speed**: Use `gpt-3.5-turbo` for faster results
- **For Accuracy**: Use `gpt-4-turbo` for better extraction
- **For Cost**: Limit document/page count and use smaller chunks

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
- [OpenAI](https://openai.com/) - For the powerful GPT models
- [pdf-parse](https://github.com/modesty/pdf-parse) - PDF parsing library
- [Cheerio](https://cheerio.js.org/) - Server-side HTML parsing
