export interface ProjectTemplate {
    id: string;
    name: string;
    description: string;
    prompt: string;
    icon: string; // Lucide icon name or emoji
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
    {
        id: "nextjs",
        name: "Next.js Application",
        description: "A modern full-stack web application with Next.js 14, Tailwind CSS, and TypeScript.",
        icon: "Layout",
        prompt: `Create a new Next.js 14 application in the root directory.
    
Requirements:
- Use TypeScript.
- Use Tailwind CSS for styling.
- Create a src/app directory structure.
- Create a src/components/ui directory for reusable components.
- Create a src/lib/utils.ts file for utility functions (cn).
- Create a landing page (page.tsx) with a hero section and features list.
- Create a reusable Button component.
- Ensure 'globals.css' is set up with Tailwind directives.
- Create a README.md file explaining how to run the project.

File structure should look like:
- src/app/layout.tsx
- src/app/page.tsx
- src/app/globals.css
- src/components/ui/button.tsx
- src/lib/utils.ts
- tailwind.config.ts
- postcss.config.js
- package.json
- tsconfig.json
- next.config.mjs
- README.md

Do not initialize git. Just create the files.`,
    },
    {
        id: "react-vite",
        name: "React + Vite",
        description: "A fast Single Page Application (SPA) with React, Vite, and Tailwind CSS.",
        icon: "Atom",
        prompt: `Create a new React application using Vite in the root directory.

Requirements:
- Use TypeScript.
- Use Tailwind CSS for styling.
- Create a src/components directory.
- Create a src/App.tsx as the main entry point.
- Create a src/main.tsx to mount the app.
- Create a clean index.html.
- Create a simple Counter component as an example.

File structure should look like:
- src/App.tsx
- src/main.tsx
- src/index.css
- src/components/Counter.tsx
- index.html
- vite.config.ts
- package.json
- tsconfig.json
- README.md`,
    },
    {
        id: "python-flask",
        name: "Python Flask API",
        description: "A lightweight Python web API using Flask.",
        icon: "Server",
        prompt: `Create a simple Python Flask API.

Requirements:
- Create app.py as the entry point.
- Create a requirements.txt file.
- Create a static folder for static assets.
- Create a templates folder for Jinja2 templates.
- Create a simplified index.html template.
- Implement a /api/health endpoint returning JSON.
- Implement a root route serving the index template.

File structure:
- app.py
- requirements.txt
- templates/index.html
- static/style.css
- README.md`,
    },
    {
        id: "static-html",
        name: "Static HTML Website",
        description: "A simple responsive website with HTML5, CSS3, and JavaScript.",
        icon: "FileCode",
        prompt: `Create a modern static website.

Requirements:
- Create index.html with semantic HTML5.
- Create style.css with responsive design (flexbox/grid).
- Create script.js for basic interactivity (e.g., mobile menu toggle).
- The design should include a Header, Hero, About, Services, and Footer section.
- Use a dark/light mode toggle if possible.

File structure:
- index.html
- style.css
- script.js
- README.md`,
    },
];
