import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const manifestPath = path.join(rootDir, 'frontend', 'src', 'config', 'pageStatus.json');
const outputPath = path.join(rootDir, 'docs', 'PAGE_STATUS.md');

const pageStatus = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

const implementedPages = pageStatus.filter((page) => page.implemented);
const plannedPages = pageStatus.filter((page) => !page.implemented);

const renderPage = (page) => {
    const available = page.availableNow.map((item) => `- ${item}`).join('\n');
    const nextSteps = page.nextSteps.map((item) => `- ${item}`).join('\n');

    return `## ${page.titleZh} / ${page.titleEn}

- 路径: \`${page.path}\`
- 快捷键: \`${page.shortcut}\`
- 当前状态: ${page.status}
- 摘要: ${page.summary}

### 已具备
${available}

### 后续建议
${nextSteps}`;
};

const markdown = `# 页面实现状态

本文件由 \`frontend/src/config/pageStatus.json\` 生成，用于作为页面导航、占位说明和文档状态的统一参考。

## 已落地主链路

${implementedPages.map((page) => `- \`${page.titleZh}\` (${page.path})`).join('\n')}

## 占位或待实现页面

${plannedPages.map((page) => `- \`${page.titleZh}\` (${page.path})`).join('\n')}

---

${pageStatus.map(renderPage).join('\n\n---\n\n')}
`;

await fs.writeFile(outputPath, markdown, 'utf8');
