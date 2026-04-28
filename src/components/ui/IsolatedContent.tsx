import { useEffect, useRef } from "react";

export function IsolatedContent({ html }: { html: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      let shadow = containerRef.current.shadowRoot;
      if (!shadow) {
        shadow = containerRef.current.attachShadow({ mode: "open" });
      }

      const styleTag = `
        <style>
          :host {
            display: block;
            font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
            color: inherit;
            line-height: 1.6;
          }
          .inner-content { 
            font-size: 14.5px; 
            color: currentColor; 
          }
          p { margin-bottom: 1rem; }
          h1, h2, h3 { margin-top: 1.5rem; margin-bottom: 0.5rem; font-weight: 700; line-height: 1.2; }
          ul, ol { padding-left: 1.5rem; margin-bottom: 1rem; }
          li { margin-bottom: 0.25rem; }
          img { max-width: 100%; height: auto; border-radius: 8px; }
          a { color: #3b82f6; text-decoration: underline; }
          blockquote { border-left: 4px solid #e5e7eb; padding-left: 1rem; font-style: italic; color: #6b7280; }
        </style>
      `;

    
      shadow.innerHTML = `${styleTag}<div class="inner-content">${html || "<i>Không có nội dung.</i>"}</div>`;
    }
  }, [html]);

  return <div ref={containerRef} />;
}