[![Build](https://github.com/neozhu/md-to-pdf-app/actions/workflows/build.yml/badge.svg)](https://github.com/neozhu/md-to-pdf-app/actions/workflows/build.yml)
[![Docker Publish](https://github.com/neozhu/md-to-pdf-app/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/neozhu/md-to-pdf-app/actions/workflows/docker-publish.yml)
[![Flow](https://github.com/neozhu/md-to-pdf-app/actions/workflows/flow.yml/badge.svg)](https://github.com/neozhu/md-to-pdf-app/actions/workflows/flow.yml)

# Markdown to PDF Converter

A modern, full-featured web application for converting Markdown documents to beautifully formatted PDFs. Built with Next.js 16, featuring real-time preview, syntax highlighting, and professional PDF rendering.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-16.1-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)


![](docs/image.png)

## ✨ Features

- **Live Preview** - Real-time Markdown preview with syntax highlighting
- **Split View** - Side-by-side editor and preview with resizable panels
- **Rich Markdown Support** - Full GFM (GitHub Flavored Markdown) support including tables, task lists, and code blocks
- **Professional PDF Output** - High-quality PDF generation with customizable styles inspired by shadcn/ui design system
- **Syntax Highlighting** - Beautiful code syntax highlighting in both preview and PDF using highlight.js
- **Dark Mode** - Full dark/light theme support with smooth transitions
- **History Management** - Track and revisit your recent document conversions
- **AI Review & Polish (Multi-Agent)** - Two AI agents (Review Pass + Polish Pass) improve clarity, tone, and readability before export
- **Export Options** - Download or view PDF inline
- **Docker Ready** - Containerized deployment with Docker and Docker Compose
- **Responsive Design** - Works seamlessly on desktop and mobile devices

## 🚀 Quick Start

### Prerequisites

- Node.js 20.x or higher
- pnpm (recommended) or npm
- Docker (optional, for containerized deployment)

### Local Development

1. **Clone the repository**

```bash
git clone https://github.com/neozhu/md-to-pdf-app.git
cd md-to-pdf-app
```

2. **Install dependencies**

```bash
pnpm install
```

3. **Run the development server**

```bash
pnpm dev
```

4. **Open your browser**

Navigate to [http://localhost:3000](http://localhost:3000)

### Production Build

```bash
pnpm build
pnpm start
```

## 🐳 Docker Deployment

### Using Docker Compose (Recommended)

```bash
# Build and start the container
docker compose up -d

# View logs
docker compose logs -f

# Stop the container
docker compose down
```

### Using Docker CLI

```bash
# Build the image
docker build -t md-to-pdf-app .

# Run the container
docker run -d \
  --name md-to-pdf-app \
  --shm-size=2g \
  --security-opt seccomp:unconfined \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable \
  md-to-pdf-app
```

The application will be available at [http://localhost:3000](http://localhost:3000)

For detailed deployment instructions, see [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md)

## 🛠️ Tech Stack

### Frontend
- **Next.js 16** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS 4** - Utility-first styling
- **shadcn/ui** - Beautiful, accessible UI components
- **CodeMirror 6** - Advanced Markdown editor with syntax highlighting
- **React Markdown** - Markdown rendering with rehype/remark plugins

### Backend
- **Next.js API Routes** - Serverless API endpoints
- **Vercel AI SDK + @ai-sdk/openai** - Multi-agent AI review and polishing pipeline
- **Puppeteer** - Headless Chrome for PDF generation
- **marked** - Fast Markdown parser
- **highlight.js** - Syntax highlighting for code blocks

### Infrastructure
- **Docker** - Containerization
- **Google Chrome Stable** - PDF rendering engine
- **pnpm** - Fast, disk space efficient package manager

## 📁 Project Structure

```
md-to-pdf-app/
├── app/                      # Next.js app directory
│   ├── api/ai-review/       # AI review & multi-agent polishing API (SSE progress)
│   ├── api/pdf/             # PDF generation API
│   ├── globals.css          # Global styles & theme
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Home page
├── components/              # React components
│   ├── md/                  # Markdown-specific components
│   │   ├── md-dashboard.tsx
│   │   ├── md-editor.tsx
│   │   ├── md-preview.tsx
│   │   └── md-workbench.tsx
│   └── ui/                  # shadcn/ui components
├── lib/                     # Utility functions
├── public/                  # Static assets
├── Dockerfile              # Docker configuration
├── docker-compose.yml      # Docker Compose configuration
└── package.json            # Dependencies
```

## 🎨 Features in Detail

### Markdown Editor
- Powered by CodeMirror 6
- Syntax highlighting for Markdown
- Auto-save to local storage
- Customizable font size and theme

### AI Review (Multi-Agent)
- **Review Pass** - Agent 1 analyzes clarity, structure, tone, and grammar and creates an improvement plan
- **Polish Pass** - Agent 2 rewrites the markdown with controlled edits while preserving meaning and structure
- **Live Progress** - AI review runs with staged progress updates in the UI and applies the polished markdown automatically

### PDF Styling
- Professional typography with Inter font family
- Syntax highlighted code blocks with dark theme
- Responsive tables with hover effects
- Clean blockquotes and lists
- Optimized for A4 paper size
- Print-friendly page breaks

### Theme Support
- Seamless light/dark mode switching
- System preference detection
- Persistent theme selection
- Smooth transitions

## 🔧 Configuration

### Environment Variables

Create a `.env.local` file for local development:

```env
# Optional: Custom Chrome executable path
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Optional: Node environment
NODE_ENV=development

# Supabase (MD History persistence)
# Create the table using docs/supabase/md_history_docs.sql
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=

# OpenAI (AI review & polish)
OPENAI_API_KEY=
# Optional
# OPENAI_MODEL=gpt-4o-mini
# OPENAI_BASE_URL=https://api.openai.com/v1
```

### PDF Customization

Modify the PDF styles in [`app/api/pdf/route.ts`](app/api/pdf/route.ts) to customize:
- Font families and sizes
- Color schemes
- Page margins
- Header/footer styles
- Code block themes

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Next.js](https://nextjs.org/) - The React framework
- [shadcn/ui](https://ui.shadcn.com/) - UI component system
- [Tailwind CSS](https://tailwindcss.com/) - CSS framework
- [Puppeteer](https://pptr.dev/) - Headless Chrome automation
- [highlight.js](https://highlightjs.org/) - Syntax highlighting
- [CodeMirror](https://codemirror.net/) - Code editor component

## 📧 Contact

For questions or support, please open an issue on [GitHub](https://github.com/neozhu/md-to-pdf-app/issues).

---

**Made with ❤️ using Next.js and TypeScript**
